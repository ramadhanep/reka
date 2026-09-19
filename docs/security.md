# Security Baseline

## Threat Model

REKA processes business-sensitive data.

Potential threats include:

- credential theft
- broken authorization
- cross-organization data access
- malicious file upload
- token theft
- SSRF
- SQL injection
- XSS
- CSRF
- abuse/rate attacks
- secret leakage
- audit tampering

## Authentication

Use proven libraries.

Do not implement cryptographic primitives.

Supported direction:

```text
Local Auth
OIDC
Keycloak
Cognito
Entra ID
```

## Passwords

If local authentication is enabled:

- Argon2id or another modern password hash
- unique salt
- safe reset flow
- brute-force/rate protection
- no plaintext password storage

## Tokens and Sessions

Use:

- short-lived access credentials
- refresh rotation when refresh tokens are used
- secure cookie attributes for browser cookies
- revocation strategy
- session/device visibility later

Do not put sensitive authorization logic only in JWT claims.

## Authorization

Frontend hiding is not security.

Every protected backend operation must enforce authorization.

Check:

```text
identity
organization
role
permission
resource scope
business constraints
```

## Files

Uploaded files must be treated as untrusted input.

Baseline:

- size limits
- MIME/type validation
- filename normalization
- safe object keys
- authorization before access
- no direct execution
- optional malware scanning later

## API

Use:

- input validation
- strict CORS
- secure headers
- parameterized queries
- rate limiting where appropriate
- request IDs
- consistent errors

## Secrets

Never commit:

- passwords
- API keys
- private keys
- production tokens

Use environment variables locally and a proper secret manager in production.

## Audit

Sensitive operations should emit audit events.

Audit logs should capture enough context to investigate abuse without collecting unnecessary personal data.

## Dependencies

Run:

- dependency vulnerability scanning
- secret scanning
- SAST
- container/image scanning

Security tools should be integrated incrementally into CI.

## Security Design Rule

When choosing between two implementations with similar complexity, prefer the one with:

- smaller attack surface
- fewer moving parts
- stronger defaults
- easier auditing
