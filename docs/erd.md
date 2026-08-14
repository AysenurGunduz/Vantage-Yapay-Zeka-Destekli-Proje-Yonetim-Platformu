# Vantage — Veritabanı İlişki Diyagramı (ERD)

Bu diyagram implementation_plan.md §4'teki taslağın görselleştirilmiş ve kesinleştirilmiş halidir. Uygulanabilir SQL şeması için: [`../backend/src/db/schema.sql`](../backend/src/db/schema.sql)

```mermaid
erDiagram
    PROFILES ||--o{ ORGANIZATION_MEMBERS : "üyedir"
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : "içerir"
    ORGANIZATIONS ||--o{ ORGANIZATION_INVITATIONS : "davet gönderir"
    ORGANIZATIONS ||--o{ PROJECTS : "sahibidir"
    PROJECTS ||--o{ PROJECT_MEMBERS : "içerir"
    PROFILES ||--o{ PROJECT_MEMBERS : "üyedir"
    PROJECTS ||--o{ TASKS : "içerir"
    TASKS ||--o{ TASKS : "alt görev"
    PROFILES ||--o{ TASKS : "atanır"
    TASKS ||--o{ TASK_COMMENTS : "sahiptir"
    TASKS ||--o{ TASK_ACTIVITY_LOG : "sahiptir"
    TASKS ||--o{ TASK_TIME_ENTRIES : "sahiptir"
    TASKS ||--o{ TASK_DEPENDENCIES : "bağımlıdır"
    PROJECTS ||--o{ AI_TASK_SUGGESTIONS : "sahiptir"
    PROFILES ||--o{ WORK_STYLE_PROFILES : "sahiptir"
    PROJECTS ||--o{ PROGRESS_SUMMARIES : "sahiptir"
    TASKS ||--o{ DELAY_RISK_SCORES : "sahiptir"

    PROFILES {
        uuid id PK
        text full_name
        text avatar_url
        text title
        text usage_purpose
        jsonb self_reported_traits
    }

    ORGANIZATIONS {
        uuid id PK
        text name
        text slug
        uuid owner_id FK
    }

    ORGANIZATION_MEMBERS {
        uuid organization_id FK
        uuid user_id FK
        member_role role
    }

    ORGANIZATION_INVITATIONS {
        uuid id PK
        uuid organization_id FK
        text email
        member_role role
        uuid token
        invitation_status status
        uuid invited_by FK
        timestamptz expires_at
    }

    PROJECT_MEMBERS {
        uuid project_id FK
        uuid user_id FK
        member_role role_in_project
    }

    PROJECTS {
        uuid id PK
        uuid organization_id FK
        text name
        text status
        date start_date
        date end_date
    }

    TASKS {
        uuid id PK
        uuid project_id FK
        uuid parent_task_id FK
        uuid assignee_id FK
        text title
        task_status status
        task_priority priority
        numeric estimated_hours
        date due_date
        integer order_index
        boolean ai_generated
    }

    TASK_TIME_ENTRIES {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        integer minutes
        text note
    }

    TASK_DEPENDENCIES {
        uuid id PK
        uuid task_id FK
        uuid depends_on_task_id FK
        task_dependency_type dependency_type
    }

    AI_TASK_SUGGESTIONS {
        uuid id PK
        uuid project_id FK
        jsonb suggested_tasks
        suggestion_status status
    }

    WORK_STYLE_PROFILES {
        uuid id PK
        uuid user_id FK
        jsonb traits
        text summary
    }

    PROGRESS_SUMMARIES {
        uuid id PK
        uuid project_id FK
        date period_start
        date period_end
        text summary
    }

    DELAY_RISK_SCORES {
        uuid id PK
        uuid task_id FK
        numeric risk_score
        risk_level risk_level
    }
```
