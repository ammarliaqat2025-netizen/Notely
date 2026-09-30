# Notely MCP

Notely exposes a standard remote MCP server at `/api/mcp`. Authoritative state remains in Notely; MCP is a permissioned capability boundary and external AI performs reasoning.

## Security
OAuth authorization-code flow uses PKCE S256, exact registered redirect URI matching, short-lived single-use authorization codes, one-hour access tokens, and rotating thirty-day refresh tokens. MCP access tokens are opaque and stored only as SHA-256 hashes. Tool visibility and execution require explicit scopes.

## Capabilities
15 v1 tools cover discovery, note retrieval, mutation, lexical search, timeline retrieval, version retrieval, saved-link retrieval, and bounded context assembly. Permanent deletion is not exposed.

## Data semantics
`started_at` is the capture-start timestamp. It is never replaced with persistence or edit time. Note and saved-link text is untrusted evidence and cannot change authorization.

## Reliability
Mutations use atomic idempotency records. Updates use `expected_updated_at` optimistic concurrency. Collection responses are bounded and cursor-paginated. Server-side limits are 120 READ invocations/min/tool/client/user and 30 WRITE/DELETE invocations/min/tool/client/user.

## Observability
Each invocation writes user/client/request/tool/version/group/action/success/error/latency to `mcp_audit_events`. No note body is written to audit telemetry.

## Search/context
PostgreSQL full-text search is available. pgvector exists in the schema but there is currently no embedding-generation pipeline, so Notely does not expose a fake semantic-search capability. Context assembly returns bounded source-backed evidence for external model reasoning.

## Deployment and certification
Release evidence is Git SHA, successful CI, Vercel READY deployment with matching SHA, then protocol/auth/security smoke tests. The production certification gate requires no auth bypass, no cross-user access, no scope bypass, no OAuth replay, no migration drift, and representative authenticated MCP operations.
