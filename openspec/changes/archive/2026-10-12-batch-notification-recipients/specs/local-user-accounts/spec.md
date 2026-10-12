# Spec Delta

## ADDED Requirements

### Requirement: A new account's email is a valid address

`createUser` SHALL refuse an email that the `to` entries of a
`notification.email` config would refuse. The refusal SHALL leave no row. It
SHALL cover an address with a CR, an LF, a space, `<` or `>`. It SHALL also
cover an address with no domain. The check SHALL run before the password hash.
`src/auth/cli.ts` SHALL report the refusal and exit non-zero.

Every notification reads this column as an SMTP address. Only the writer can
keep a line break or a typo out of it.

#### Scenario: The CLI refuses an address with no domain

- **WHEN** the CLI's `add-user` command runs with the email `max.muster`
- **THEN** the command reports the refusal and exits non-zero
- **AND** no row in `auth_users` holds that email

#### Scenario: An address with a line break creates no row

- **WHEN** `createUser` receives the email `a@x.ch>` followed by CR, LF and
  `RCPT TO:<leak@evil.example`
- **THEN** it refuses, and no row in `auth_users` holds that text

#### Scenario: A plain address still creates an account

- **WHEN** `createUser` receives the email `jane@co.com`
- **THEN** the account exists and can log in
