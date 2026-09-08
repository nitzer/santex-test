# Platform on-call runbook

## Escalation

1. Check the checkout-api latency dashboard.
2. If p99 > 2s for more than 5 minutes, notify the #oncall-platform channel.
3. If the error rate exceeds 2%, start a rollback of the latest release.

## Contacts

- Primary on-call: martin.rios@ops.example
- Secondary on-call: lucia.mendez@ops.example
