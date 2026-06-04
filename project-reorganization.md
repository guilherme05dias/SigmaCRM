# Project Reorganization Plan

This plan outlines the reorganization of the SigmaCRM project to separate frontend and backend layers, centralize database schemas, and clean up the root workspace structure.

## Overview

The current workspace contains two separate application roots (`crm-tecnicos-app` and `servicocrm-web`). To improve developer experience and conform to modern project layouts, we are organizing the workspace as a polyglot monorepo with distinct layers:
1. `frontend/` containing user interface components (Web & Streamlit clients).
2. `backend/` containing API components and server services (WhatsApp Bridge).
3. `database/` containing PostgreSQL and SQLite schemas/migration scripts.
4. `docs/` containing overall system and project documentation.

## Proposed Changes

### [Workspace Restructuring]

#### [NEW] [frontend/](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/frontend)
#### [NEW] [backend/](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/backend)
#### [NEW] [database/](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/database)
#### [NEW] [docs/](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/docs)

---

### [Frontend Component]

- Move Next.js application to `frontend/web/`
- Move Streamlit application to `frontend/streamlit/`

#### [MODIFY] [web](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/frontend/web) (moved from `servicocrm-web`)
#### [MODIFY] [streamlit](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/frontend/streamlit) (moved from `crm-tecnicos-app`)

---

### [Backend Component]

- Move Node.js WhatsApp bridge to `backend/whatsapp-bridge/`

#### [MODIFY] [whatsapp-bridge](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/backend/whatsapp-bridge) (moved from `crm-tecnicos-app/whatsapp_bridge`)

---

### [Database & Migrations Component]

- Centralize database migrations, SQLite seeds, and raw data files into the root `database/` directory.

#### [NEW] [supabase_schema.sql](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/database/supabase/supabase_schema.sql) (moved from `crm-tecnicos-app/supabase_schema.sql`)
#### [MODIFY] [migrate_to_supabase.py](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/frontend/streamlit/migrate_to_supabase.py) (kept with the Streamlit app and updated to read schemas from `database/supabase/`)
#### [NEW] [crm_dados.xlsx](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/database/data/crm_dados.xlsx) (moved from `crm-tecnicos-app/crm_dados.xlsx`)

---

### [Documentation Component]

- Move PRD, Roadmap, Design system definitions, and Setup instructions to a dedicated `docs/` folder to clean up the application roots.

#### [NEW] [PRD.md](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/docs/PRD.md)
#### [NEW] [ROADMAP.md](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/docs/ROADMAP.md)
#### [NEW] [DESIGN_SYSTEM.md](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/docs/DESIGN_SYSTEM.md)
#### [NEW] [DESIGN-meta.md](file:///c:/Users/Guilherme%20Dias/Desktop/SigmaCRM/docs/DESIGN-meta.md)

---

## Verification Plan

### Automated Tests
- Run `python .agent/scripts/checklist.py .` to ensure lint and structure checks pass.
- Run `npm run lint` or local TypeScript check inside `frontend/web/`.

### Manual Verification
- Verify running the Streamlit app using the updated `frontend/streamlit/run_app.bat`.
- Verify the Node.js bridge builds and runs from `backend/whatsapp-bridge/`.

## ✅ PHASE X COMPLETE
- Lint: ✅ Pass
- Security: ✅ No critical issues
- Build: ✅ Success
- Date: 2026-06-03
