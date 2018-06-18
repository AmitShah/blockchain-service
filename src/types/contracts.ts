// #region GENERATED

export * from './__GEN__/NettingChannelContract'
export * from './__GEN__/HumanStandardToken'
export * from './__GEN__/ChannelManagerContract'

// #endregion GENERATED

import { TxParamsRequired, TxParamsWithGas, TxResult, Address, Wei } from 'eth-types'
import { ChannelEvents } from './__GEN__/NettingChannelContract'
import { ManagerEvents } from './__GEN__/ChannelManagerContract'
import { TokenEvents } from './__GEN__/HumanStandardToken'

export type Method<In, Out> = [In, Out]

export interface ContractBase {
  [k: string]: Method<any, any>
}

export type ContractInOrder<CB extends ContractBase> = {
  [K in keyof CB]: Array<keyof CB[K][0]>
}

export type ContractOut<CB extends ContractBase> = {
  [K in keyof CB]: CB[K][1]
}

export type CreateTxParams<In extends ({} | null), Out> = (provided: TxParamsRequired & TxParamsWithGas) => (params: In) => Out

export type FunctionCall<T extends { [K: string]: [any, any] }, Out> = {
  [K in keyof T]: CreateTxParams<T[K][0], Out>
}

export type CreateTxConstParams<In extends ({} | null), Out> = (provided: TxParamsRequired) => (params: In) => Out

export type FunctionConstCall<T extends { [K: string]: [any, any] }, Out> = {
  [K in keyof T]: CreateTxConstParams<T[K][0], Out>
}

export type TxRequest<T extends { [K: string]: [any, any] }> = {
  [K in keyof T]: (data: T[K][0], from: Address, value?: Wei) => Promise<TxResult<T[K][1]>>
}

export type BlockchainEventType = ChannelEvents | ManagerEvents | TokenEvents
// TODO: FIXME
export type BlockchainEvent = any
