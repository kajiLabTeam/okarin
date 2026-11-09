import { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import {
  createOrganizationCreationRequestRequestSchema,
  organizationCreationRequestSchema,
  organizationSlugSchema,
} from './organizations.js'

describe('organization creation request schemas', () => {
  it('generates nullable slug constraints for both request and response in OpenAPI 3.0', () => {
    const app = new OpenAPIHono()
    app.openAPIRegistry.register('OrganizationSlug', organizationSlugSchema)
    app.openAPIRegistry.register(
      'CreateOrganizationCreationRequestRequest',
      createOrganizationCreationRequestRequestSchema
    )
    app.openAPIRegistry.register('OrganizationCreationRequest', organizationCreationRequestSchema)

    const document = app.getOpenAPIDocument({
      openapi: '3.0.0',
      info: { title: 'Schema regression test', version: '1' },
    })
    const request = document.components?.schemas?.CreateOrganizationCreationRequestRequest
    const response = document.components?.schemas?.OrganizationCreationRequest
    if (!request || '$ref' in request || !response || '$ref' in response) {
      throw new Error('Expected request and response schema objects')
    }

    const nullableSlug = {
      type: 'string',
      minLength: 3,
      maxLength: 63,
      pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
      nullable: true,
    }
    expect(request.properties?.requested_slug).toEqual(nullableSlug)
    expect(response.properties?.requested_slug).toEqual(nullableSlug)
    expect(request.required).not.toContain('requested_slug')
    expect(response.required).toContain('requested_slug')
    expect(document.components?.schemas?.OrganizationSlug).toEqual({
      type: 'string',
      minLength: 3,
      maxLength: 63,
      pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    })
  })

  it('accepts omitted and null request slugs while requiring the response field', () => {
    expect(
      createOrganizationCreationRequestRequestSchema.safeParse({ organization_name: 'Example' })
        .success
    ).toBe(true)
    expect(
      createOrganizationCreationRequestRequestSchema.safeParse({
        organization_name: 'Example',
        requested_slug: null,
      }).success
    ).toBe(true)
    expect(organizationCreationRequestSchema.shape.requested_slug.safeParse(null).success).toBe(
      true
    )
    expect(
      organizationCreationRequestSchema.shape.requested_slug.safeParse(undefined).success
    ).toBe(false)
  })

  it.each(['ab', 'a'.repeat(64), 'Invalid', 'invalid--slug', 'admin', 'api'])(
    'rejects invalid or reserved slug %s in request and response',
    (slug) => {
      expect(
        createOrganizationCreationRequestRequestSchema.safeParse({
          organization_name: 'Example',
          requested_slug: slug,
        }).success
      ).toBe(false)
      expect(organizationCreationRequestSchema.shape.requested_slug.safeParse(slug).success).toBe(
        false
      )
    }
  )

  it('accepts a valid slug in request and response', () => {
    expect(
      createOrganizationCreationRequestRequestSchema.safeParse({
        organization_name: 'Example',
        requested_slug: 'example-org',
      }).success
    ).toBe(true)
    expect(
      organizationCreationRequestSchema.shape.requested_slug.safeParse('example-org').success
    ).toBe(true)
  })
})
