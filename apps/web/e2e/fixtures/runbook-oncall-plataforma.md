# Runbook on-call plataforma

## Escalamiento

1. Revisar el dashboard de latencia de checkout-api.
2. Si p99 > 2s por más de 5 minutos, avisar al canal #oncall-plataforma.
3. Si el error rate supera 2%, iniciar rollback del último release.

## Contactos

- Guardia primaria: martin.rios@ops.example
- Guardia secundaria: lucia.mendez@ops.example
