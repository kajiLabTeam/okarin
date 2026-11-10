import type { RequestActor } from '../../middleware/request-actor-context.js'
import { mergePositioningRunItemOutputManifest } from '../../services/analysis-runs/positioning-analysis-callback-repository.js'
import { db } from '../../services/db/index.js'
import {
  ArtifactRetryError,
  retryParticleAnimationInNozomi,
} from '../../services/nozomi/nozomi-execution-client.js'
import { issueInternalPositioningAnalysisArtifactUploadUrl } from '../../services/storage/presigned-url.js'
import {
  findTrajectoryById,
  findTrajectoryOutputManifestById,
} from '../../services/trajectories/index.js'
import { requireDashboardWriteAccess } from '../authorization.js'

export const retryParticleAnimation = async (actor: RequestActor, trajectoryId: string) => {
  const trajectory = await findTrajectoryById(trajectoryId)
  if (!trajectory)
    return { ok: false as const, status: 404 as const, message: '軌跡が見つかりません。' }
  const authorization = requireDashboardWriteAccess(actor, trajectory.organization_id)
  if (!authorization.ok)
    return {
      ok: false as const,
      status: 403 as const,
      message: '動画を再生成する権限がありません。',
    }
  const itemId = trajectory.execution?.analysis_run_item_id
  const runId = trajectory.execution?.analysis_run_id
  const manifest = await findTrajectoryOutputManifestById(trajectoryId)
  const video = manifest?.artifacts.particle_animation
  if (
    trajectory.status !== 'completed' ||
    !itemId ||
    !runId ||
    !video ||
    (video.generation_status !== 'failed' && video.generation_status !== 'processing') ||
    video.retry_available !== true
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      message:
        'この動画は再生成できません。保存済みの粒子データがない場合は歩行データから新しく解析してください。',
    }
  }
  try {
    const [webm, mp4] = await Promise.all([
      issueInternalPositioningAnalysisArtifactUploadUrl(
        trajectory.organization_id,
        runId,
        itemId,
        'particle_animation',
        'webm',
        'video/webm'
      ),
      issueInternalPositioningAnalysisArtifactUploadUrl(
        trajectory.organization_id,
        runId,
        itemId,
        'particle_animation',
        'mp4',
        'video/mp4'
      ),
    ])
    const accepted = await retryParticleAnimationInNozomi(itemId, {
      particle_animation: {
        upload_uri: webm.uploadUrl,
        object_key: webm.objectKey,
        content_type: 'video/webm',
        format: 'webm',
      },
      particle_animation_mp4: {
        upload_uri: mp4.uploadUrl,
        object_key: mp4.objectKey,
        content_type: 'video/mp4',
        format: 'mp4',
        manifest_name: 'particle_animation',
      },
    })
    await db.transaction().execute((transaction) =>
      mergePositioningRunItemOutputManifest(
        itemId,
        {
          particle_animation: {
            ...video,
            generation_status: 'processing',
            generation_attempt: accepted.generation_attempt,
          },
        },
        transaction
      )
    )
    return {
      ok: true as const,
      value: {
        trajectory_id: trajectoryId,
        generation_status: 'processing' as const,
        generation_attempt: accepted.generation_attempt,
      },
    }
  } catch (error) {
    if (!(error instanceof ArtifactRetryError)) throw error
    return {
      ok: false as const,
      status: error.status === 409 ? (409 as const) : (502 as const),
      message:
        error.status === 409
          ? '動画の再生成に必要な粒子データがありません。歩行データから新しく解析してください。'
          : '動画の再生成を受け付けられませんでした。時間をおいて再度お試しください。',
    }
  }
}
