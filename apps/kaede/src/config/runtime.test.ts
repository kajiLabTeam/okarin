import { afterEach, describe, expect, it } from 'vitest'
import { getAppRuntimeConfig, resetRuntimeConfigForTests } from './runtime.js'

const originalAppEnv = process.env.APP_ENV
const originalSharedToken = process.env.KAEDE_API_SHARED_TOKEN

const restoreEnv = () => {
  if (originalAppEnv === undefined) {
    Reflect.deleteProperty(process.env, 'APP_ENV')
  } else {
    process.env.APP_ENV = originalAppEnv
  }

  if (originalSharedToken === undefined) {
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
  } else {
    process.env.KAEDE_API_SHARED_TOKEN = originalSharedToken
  }

  resetRuntimeConfigForTests()
}

describe('getAppRuntimeConfig', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('local では shared token 未設定を許可する', () => {
    process.env.APP_ENV = 'local'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(getAppRuntimeConfig()).toMatchObject({
      apiSharedToken: undefined,
      env: 'local',
    })
  })

  it('test では shared token 未設定を許可する', () => {
    process.env.APP_ENV = 'test'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(getAppRuntimeConfig()).toMatchObject({
      apiSharedToken: undefined,
      env: 'test',
    })
  })

  it('local/test 以外では shared token 未設定を拒否する', () => {
    process.env.APP_ENV = 'staging'
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()

    expect(() => getAppRuntimeConfig()).toThrow(
      'KAEDE_API_SHARED_TOKEN is required outside local/test environments'
    )
  })
})
