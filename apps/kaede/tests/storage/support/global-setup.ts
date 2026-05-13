import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { GenericContainer, Wait } from 'testcontainers'

const s3AccessKeyId = 'kaede-test'
const s3SecretAccessKey = 'change_me_test_kaede_secret_key'
const s3BootstrapAccessKeyId = 'storage-bootstrap-test'
const s3BootstrapSecretAccessKey = 'change_me_test_storage_bootstrap_secret_key'
const s3Bucket = 'okarin-test'
const s3Region = 'us-east-1'
const seaweedS3Port = 8333
const seaweedMasterPort = 9333

const s3Config = JSON.stringify({
  identities: [
    {
      name: 'okarin-test-kaede',
      credentials: [
        {
          accessKey: s3AccessKeyId,
          secretKey: s3SecretAccessKey,
        },
      ],
      actions: ['Read', 'Write', 'List'],
    },
    {
      name: 'okarin-test-storage-bootstrap',
      credentials: [
        {
          accessKey: s3BootstrapAccessKeyId,
          secretKey: s3BootstrapSecretAccessKey,
        },
      ],
      actions: ['Admin', 'Read', 'Write', 'List'],
    },
  ],
})

interface SetupContext {
  provide: (
    key:
      | 's3AccessKeyId'
      | 's3Bucket'
      | 's3Endpoint'
      | 's3PublicEndpoint'
      | 's3Region'
      | 's3SecretAccessKey',
    value: string
  ) => void
}

const sleep = async (ms: number) => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const createBucketWithRetry = async (client: S3Client, bucket: string) => {
  let lastError: unknown

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await client.send(
        new CreateBucketCommand({
          Bucket: bucket,
        })
      )
      return
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }

  throw lastError
}

export default async function setup({ provide }: SetupContext) {
  const container = await new GenericContainer('chrislusf/seaweedfs:4.17')
    .withCommand([
      'server',
      '-s3',
      `-s3.port=${seaweedS3Port}`,
      '-s3.config=/etc/seaweedfs/s3.conf',
      '-dir=/data',
    ])
    .withCopyContentToContainer([
      {
        content: s3Config,
        target: '/etc/seaweedfs/s3.conf',
      },
    ])
    .withExposedPorts(seaweedS3Port, seaweedMasterPort)
    .withWaitStrategy(Wait.forHttp('/cluster/status', seaweedMasterPort))
    .start()

  try {
    const s3Endpoint = `http://${container.getHost()}:${container.getMappedPort(seaweedS3Port)}`
    const s3PublicEndpoint = s3Endpoint
    const bootstrapClient = new S3Client({
      region: s3Region,
      endpoint: s3Endpoint,
      credentials: {
        accessKeyId: s3BootstrapAccessKeyId,
        secretAccessKey: s3BootstrapSecretAccessKey,
      },
      forcePathStyle: true,
    })

    await createBucketWithRetry(bootstrapClient, s3Bucket)

    provide('s3AccessKeyId', s3AccessKeyId)
    provide('s3SecretAccessKey', s3SecretAccessKey)
    provide('s3Endpoint', s3Endpoint)
    provide('s3PublicEndpoint', s3PublicEndpoint)
    provide('s3Region', s3Region)
    provide('s3Bucket', s3Bucket)

    return async () => {
      bootstrapClient.destroy()
      await container.stop()
    }
  } catch (error) {
    await container.stop()
    throw error
  }
}
