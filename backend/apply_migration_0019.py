import sqlite3

con = sqlite3.connect(r'c:\Users\el mostafa\Downloads\newcareos-main\backend\careos.db')
cur = con.cursor()

# Check appointments columns
appt_cols = [c[1] for c in cur.execute("PRAGMA table_info(appointments)").fetchall()]
if "clinician_id" not in appt_cols:
    print("Adding clinician_id to appointments...")
    cur.execute("ALTER TABLE appointments ADD COLUMN clinician_id CHAR(32)")
    cur.execute("CREATE INDEX IF NOT EXISTS ix_appointments_clinician_id ON appointments (clinician_id)")

if "duration_minutes" not in appt_cols:
    print("Adding duration_minutes to appointments...")
    cur.execute("ALTER TABLE appointments ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 30")

# Check clinician_schedules
cur.execute("""
CREATE TABLE IF NOT EXISTS clinician_schedules (
    id CHAR(32) PRIMARY KEY,
    organization_id CHAR(32) NOT NULL,
    clinician_id CHAR(32) NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY(organization_id) REFERENCES organizations(id),
    FOREIGN KEY(clinician_id) REFERENCES users(id)
)
""")

# Check schedule_overrides
cur.execute("""
CREATE TABLE IF NOT EXISTS schedule_overrides (
    id CHAR(32) PRIMARY KEY,
    organization_id CHAR(32) NOT NULL,
    clinician_id CHAR(32) NOT NULL,
    override_date DATE NOT NULL,
    override_type VARCHAR(20) NOT NULL,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY(organization_id) REFERENCES organizations(id),
    FOREIGN KEY(clinician_id) REFERENCES users(id)
)
""")

# Update alembic_version
cur.execute("DELETE FROM alembic_version")
cur.execute("INSERT INTO alembic_version (version_num) VALUES ('0019_availability_and_schedules')")

con.commit()
con.close()
print("Migration 0019 completed and alembic_version updated to 0019_availability_and_schedules!")
