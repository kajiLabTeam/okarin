import type { UploadTarget } from '../../schemas/common.js'
import type { AssetContract, Pipeline } from '../../schemas/pipelines.js'
import { listRecordingDataAssets } from '../data-assets/index.js'
import { findRecordingById } from '../recordings/index.js'
import { buildRecordingRawObjectKey } from '../storage/index.js'
import { getCachedPipelineCatalog } from './pipeline-catalog-cache.js'
import { resolveActivePipeline } from './pipeline-client.js'
import { resolveFloorResources } from './pipeline-resource-resolver.js'
import type { PipelineResourceAsset } from './pipeline-resource-resolver.js'

interface Asset extends PipelineResourceAsset {
  data_asset_id: string
  data_type: string
  schema_version: string
  format: string
  validation_status: string
  data_asset_object_id?: string
}
interface Issue {
  slot_id: string
  code: 'MISSING_INPUT' | 'AMBIGUOUS_INPUT' | 'RESOURCE_NOT_AVAILABLE'
}

type ExecutionResolutionError =
  | { type: 'PIPELINE_UNAVAILABLE'; reason: Pipeline['availability']['reason'] }
  | {
      type: 'PIPELINE_INPUT_UNAVAILABLE'
      recordings: { recording_id: string; issues: Issue[] }[]
    }

/** Combine typed assets, legacy sensor fallbacks, and floor-scoped resources. */
export interface PipelineResourceProvider {
  listAssets(recordingId: string): Promise<Asset[]>
}
export interface ResolvedPipelineRecording {
  recording_id: string
  assets: Asset[]
  bindings: Record<string, string>
  issues: Issue[]
}

export const recordingAssetProvider: PipelineResourceProvider = {
  listAssets: async (recordingId) => {
    const assets = (await listRecordingDataAssets(recordingId)) as Asset[]
    const recording = await findRecordingById(recordingId)
    if (!recording) return assets

    // Legacy recordings store sensor files under raw/ and only expose them through
    // upload_targets. Present them as virtual assets so the pipeline resolver can
    // use the same binding and input-manifest path as typed data assets.
    const legacyAssets = recording.upload_targets
      .filter((target): target is Exclude<UploadTarget, 'metadata'> => target !== 'metadata')
      .filter((target) => !assets.some((asset) => asset.data_type === target))
      .map((target) => ({
        data_asset_id: `legacy:${recording.id}:${target}`,
        data_type: target,
        schema_version: '1',
        format: 'csv',
        validation_status: 'valid',
        object_key: buildRecordingRawObjectKey(recording.organization_id, recording.id, target),
      }))

    const resources = await resolveFloorResources(recording)
    return [...assets, ...legacyAssets, ...resources]
  },
}

const matches = (asset: Asset, accepted: AssetContract) =>
  asset.data_type === accepted.data_type &&
  asset.schema_version === accepted.schema_version &&
  asset.format === accepted.format

const bindingFor = (
  pipeline: { input_slots: Pipeline['definition']['input_slots'] },
  assets: Asset[]
) => {
  const bindings: Record<string, string> = {}
  const issues: Issue[] = []
  for (const slot of pipeline.input_slots) {
    const candidates = assets.filter(
      (asset) =>
        asset.validation_status === 'valid' &&
        slot.accepted_contracts.some(
          (contract) => contract.kind === 'asset' && matches(asset, contract)
        )
    )
    if (candidates.length === 1) bindings[slot.slot_id] = candidates[0].data_asset_id
    else if (candidates.length === 0 && slot.required)
      issues.push({
        slot_id: slot.slot_id,
        code: slot.accepted_contracts.some(
          (contract) => contract.kind === 'asset' && contract.data_type.startsWith('resource.')
        )
          ? 'RESOURCE_NOT_AVAILABLE'
          : 'MISSING_INPUT',
      })
    else if (candidates.length > 1) issues.push({ slot_id: slot.slot_id, code: 'AMBIGUOUS_INPUT' })
  }
  return { bindings, issues }
}

export const listPipelineAvailability = async (
  recordingIds: string[],
  resourceProvider = recordingAssetProvider
) => {
  const pipelines = await getCachedPipelineCatalog()
  const recordings = await Promise.all(
    recordingIds.map(async (recording_id) => ({
      recording_id,
      assets: await resourceProvider.listAssets(recording_id),
    }))
  )
  return {
    pipelines: pipelines.map((pipeline) => ({
      ...(() => {
        const recordingResults = recordings.map(({ recording_id, assets }) => {
          const result = bindingFor(pipeline, assets)
          return {
            recording_id,
            available: pipeline.availability.available && result.issues.length === 0,
            ...result,
          }
        })
        const unavailableReasons = [
          ...(pipeline.availability.reason
            ? [
                {
                  code: pipeline.availability.reason.code,
                  target: pipeline.availability.reason.target,
                },
              ]
            : []),
          ...recordingResults.flatMap((recording) =>
            recording.issues.map((issue) => ({
              code: issue.code,
              recording_id: recording.recording_id,
              slot_id: issue.slot_id,
            }))
          ),
        ]
        return {
          pipeline_id: pipeline.pipeline_id,
          display_name: pipeline.display_name,
          digest: pipeline.digest,
          definition_version: pipeline.definition_version,
          available:
            pipeline.availability.available &&
            recordingResults.every((recording) => recording.available),
          engine_availability: pipeline.availability,
          unavailable_reasons: unavailableReasons,
          recordings: recordingResults,
        }
      })(),
    })),
  }
}

export const resolvePipelineForExecution = async (
  pipelineId: string,
  recordingIds: string[],
  resourceProvider = recordingAssetProvider
) => {
  const pipeline = await resolveActivePipeline(pipelineId)
  if (pipeline.definition.state !== 'active' || !pipeline.availability.available) {
    return {
      ok: false as const,
      error: {
        type: 'PIPELINE_UNAVAILABLE' as const,
        reason: pipeline.availability.reason,
      } satisfies ExecutionResolutionError,
    }
  }
  const recordings = await Promise.all(
    recordingIds.map(async (recording_id) => ({
      recording_id,
      assets: await resourceProvider.listAssets(recording_id),
    }))
  )
  const resolvedRecordings: ResolvedPipelineRecording[] = recordings.map(
    ({ recording_id, assets }) => ({
      recording_id,
      assets,
      ...bindingFor(pipeline.definition, assets),
    })
  )
  const unavailableRecordings = resolvedRecordings
    .filter((recording) => recording.issues.length > 0)
    .map(({ recording_id, issues }) => ({ recording_id, issues }))
  if (unavailableRecordings.length > 0) {
    return {
      ok: false as const,
      error: {
        type: 'PIPELINE_INPUT_UNAVAILABLE' as const,
        recordings: unavailableRecordings,
      } satisfies ExecutionResolutionError,
    }
  }
  return {
    ok: true as const,
    value: { pipeline, recordings: resolvedRecordings },
  }
}
