import { Observable } from 'rxjs/Observable'
import { Subject } from 'rxjs/Subject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { EventEmitter } from 'events'

import { as, add } from '../utils'

import * as C from '../types/contracts'
import { BlockchainEventType } from '../types'
import * as T from './types'
import * as E from 'eth-types'

// todo: make it configurable
const KEY_PREFIX = '___ETH_MONITORING___'
const LOGS_INTERVAL = 5 * 1000
const waitForDefault: T.WaitForConfig = { interval: 5 * 1000, timeout: 120 * 1000 }

export type MonitorAddress = [E.Address, string]

export interface State {
  addresses: MonitorAddress[],
  transactions: E.Address[]
}

export class Monitoring implements T.Monitoring {
  private _cfg: T.MonitoringConfig
  private _em = new EventEmitter()
  private _state: Promise<State>
  private _sub: any

  private _blockNumberSub = new BehaviorSubject<E.BlockNumber | undefined>(undefined)
  private _forceMonitoring = new Subject<boolean>()

  constructor (cfg: T.MonitoringConfig) {
    this._cfg = cfg
    this._state = cfg.storage.getItem(KEY_PREFIX + cfg.channelManagerAddress)
      .then(s => s ? JSON.parse(s) : ({
        addresses: [
          [cfg.channelManagerAddress, '-1'],
          ...cfg.tokenAddresses.map(t => [t, '-1'])
        ],
        transactions: []
      }))

    this._sub =
      this._monitorAddresses()
        .merge(
          this._monitorBlockNumber()
        )
        .subscribe()

  }

  blockNumbers = () => this._blockNumberSub.filter(Boolean) as Observable<E.BlockNumber>
  gasPrice = () => this._cfg.rpc.gasPrice() // todo: improve monitor of gas price it in very long intervals

  subscribeAddress = (a: E.Address) =>
    this._state.then(s => {
      if (s.addresses.find(_a => _a[0].equals(a))) return Promise.resolve(false)
      s.addresses.push([a, '-1'])
      return this._saveState(s)
        .then(() => this._forceMonitoring.next(true) || true)
    })

  unsubscribeAddress = (a: E.Address) => {
    if (a === this._cfg.channelManagerAddress) return Promise.resolve(false)
    return this._state.then(s => {
      s.addresses = s.addresses.filter(_a => !_a[0].equals(a))
      return this._saveState(s)
        .then(() => this._forceMonitoring.next(true) || true)
    })
  }

  asStream = (ev: BlockchainEventType | BlockchainEventType[]) =>
    Observable.from(Array.isArray(ev) ? ev : [ev])
      .mergeMap(e => Observable.fromEvent(this, e)) as Observable<any>

  waitForTransactionRaw = (tx: E.TxHash, cfg?: Partial<T.WaitForConfig>) =>
    Observable.timer(0, cfg && cfg.interval || waitForDefault.interval)
      .switchMap(() => this._cfg.rpc.getTransactionReceipt(tx) as Promise<E.TxReceipt>)
      .filter(Boolean)
      .take(1)
      .retryWhen(errs => errs.delay(3 * 1000)) // this should not happen
      .timeout(cfg && cfg.timeout || waitForDefault.timeout)

  waitForTransaction = (tx: E.TxHash, cfg?: Partial<T.WaitForConfig>) =>
    this.waitForTransactionRaw(tx, cfg)
      .toPromise()

  on = (event: C.BlockchainEventType, listener: (...args: any[]) => void) => {
    this._em.on(event, listener)
  }

  off = (event: C.BlockchainEventType, listener: (...args: any[]) => void) => {
    this._em.removeListener(event, listener)
  }

  dispose = () => this._sub && this._sub.unsubscribe()

  private _blockNumber = () => this._blockNumberSub.value

  private _monitorBlockNumber = () =>
    Observable.timer(0, LOGS_INTERVAL)
      .switchMap(() =>
        Observable.defer(() => this._cfg.rpc.blockNumber())
          .retryWhen(errs => errs.delay(1000))
      )
      .do(x => !x.eq(this._blockNumber() || 0) && this._blockNumberSub.next(x))

  private _monitorAddresses = () =>
    (Observable.combineLatest(
      this._blockNumberSub,
      this._forceMonitoring.merge(Observable.of(true)),
      n => n
    )
      .filter(x => x !== undefined) as Observable<E.BlockNumber>)
      .switchMap(blockNumber =>
        Observable.defer(() => this._state)
          .mergeMap((s: State) =>
            Observable.from(s.addresses)
              .groupBy(a => a[1])
              .mergeMap(xs => xs
                .map(x => x[0])
                .reduce((acc, x) => acc.concat([x]), [])
                .mergeMap(gs =>
                  Observable.defer(() => {
                    const bn = as.BlockNumber(xs.key)
                    if (bn.lt(blockNumber)) {
                      return this._cfg.rpc.getLogs({
                        fromBlock: add(bn, as.BlockNumber(1)),
                        toBlock: blockNumber,
                        address: gs
                      })
                    } else {
                      return Observable.of([] as C.BlockchainEvent[])
                    }
                  })
                    .reduce((acc, logs) => ({
                      logs: acc.logs.concat(logs),
                      addresses: acc.addresses.concat(gs)
                    }), { logs: [] as any, addresses: [] as E.Address[] })
                ))
              .do(({ logs, addresses }) => {
                // everything here is done synchronously so top most switchMap will not terminate it
                logs.forEach(l => this._em.emit(l._type, l))
                addresses.forEach(add => {
                  const a = s.addresses.find(_a => _a[0] === add)
                  if (a) {
                    a[1] = blockNumber.toString()
                  }
                })
                this._saveState(s)
              })
          )
          .retryWhen(errs => errs.delay(1000))
      )

  private _saveState = (s: State) =>
    this._cfg.storage.setItem(KEY_PREFIX + this._cfg.channelManagerAddress, JSON.stringify(s))
}

export const waitForRaw = <P, T> (action: ((params: P) => Promise<T>), cfg?: Partial<T.WaitForConfig>) =>
  (params: P) =>
    Observable.timer(0, cfg && cfg.interval || waitForDefault.interval)
      .switchMap(() => action(params) as Promise<T>)
      .filter(Boolean)
      .take(1)
      .timeout(cfg && cfg.timeout || waitForDefault.timeout)

export const waitFor = <P, T> (action: ((params: P) => Promise<T>), cfg?: Partial<T.WaitForConfig>) =>
  (params: P) =>
    waitForRaw(action, cfg)(params)
      .toPromise()
