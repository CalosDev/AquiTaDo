# Monolito Modular Sugerido (AquiTaDo 2.0)

```text
apps/api/src
|-- core/
|   |-- authorization/           # RBAC + ABAC policies and guards
|   |-- events/                  # domain event bus (async projections)
|   |-- filters/                 # global exception mapping
|   |-- interceptors/            # request context + JSON:API response
|   |-- persistence/             # BaseRepository + BaseService
|   |-- request-context/         # AsyncLocalStorage request scope
|
|-- prisma/                      # Prisma service and DB connection policies
|-- discovery/                   # geospatial read model (PostGIS ST_DWithin)
|-- businesses/                  # core business domain
|-- organizations/               # tenant and membership boundaries
|-- payments/                    # billing and marketplace transactions
|-- messaging/                   # mini-CRM conversation workflows
|-- analytics/                   # metrics and reporting
|-- search/                      # Meilisearch integration
|-- cache/                       # Redis cache-aside helpers
|-- auth/                        # JWT access/refresh auth
|-- ...                          # remaining bounded contexts
```

## Reglas de crecimiento

- `core/` solo contiene capacidades transversales.
- Cada dominio expone `module + controller + service + dto` y opcionalmente `repository`.
- Lecturas intensivas (search/discovery) se separan de escrituras transaccionales.
- Cualquier evento de cambio de negocio se publica en `core/events` para invalidar cache/sync de proyecciones.

