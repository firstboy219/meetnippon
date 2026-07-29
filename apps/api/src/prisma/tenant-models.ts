/**
 * Set of Prisma models that carry a `tenantId` scalar and MUST be tenant-scoped.
 * Keep in sync with schema.prisma. The Tenant model itself is intentionally NOT
 * here (it is the tenant root and is looked up unscoped during auth/host resolution).
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'TenantDomain',
  'TenantBranding',
  'SubdomainRedirect',
  'TenantFeatureFlag',
  'EmailTemplate',
  'TenantApiKey',
  'TenantMailSetting',
  'User',
  'OfficeLocation',
  'Building',
  'Floor',
  'FloorPlan',
  'Resource',
  'BookingPolicy',
  'Booking',
  'BookingChangeRequest',
  'RegistrationRequest',
  'HiddenMenuItem',
  'ApprovalStep',
  'ExternalApprovalTask',
  'Recording',
  'ChatConversation',
  'ChatMember',
  'ChatMessage',
  'Notification',
  'WorkLocationLog',
  'AuditLog',
]);

/** Operations whose `where` we must constrain with tenantId. */
export const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/** Operations whose `data` we must stamp with tenantId. */
export const CREATE_OPS = new Set(['create', 'createMany']);

/** Single-record write ops that need both where-scope and (for upsert) data-stamp. */
export const SINGLE_WRITE_OPS = new Set(['update', 'delete', 'upsert']);
