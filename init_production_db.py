import sys
import os
from datetime import datetime, timedelta
import random

# Add parent directory to path to import backend
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend import models, database, auth

def seed_data():
    # Ensure tables are created
    models.Base.metadata.create_all(bind=database.engine)
    
    db = next(database.get_db())
    
    # 0. Clean old data (Optional but good for fresh seed)
    print("Cleaning database...")
    db.query(models.AuditLog).delete()
    db.query(models.DashboardWidget).delete()
    db.query(models.Email).delete()
    db.query(models.Thread).delete()
    db.query(models.Contact).delete()
    db.query(models.User).delete()
    db.commit()

    print("Seeding Professional Dashboard Data...")

    # 1. Create Users (Super Admin, Admins, Workers)
    pwd = auth.get_password_hash("admin123")
    
    super_admin = models.User(
        email="super@rfiagent.com",
        full_name="Zeeshan Super Admin",
        hashed_password=pwd,
        role="super_admin",
        last_login=datetime.utcnow() - timedelta(minutes=15)
    )
    
    admin_1 = models.User(
        email="admin@rfiagent.com",
        full_name="Farhan Admin",
        hashed_password=pwd,
        role="admin",
        last_login=datetime.utcnow() - timedelta(hours=2)
    )

    workers = [
        models.User(email=f"worker{i}@rfiagent.com", full_name=f"Worker {i}", hashed_password=pwd, role="user", last_login=datetime.utcnow() - timedelta(days=i))
        for i in range(1, 6)
    ]

    db.add(super_admin)
    db.add(admin_1)
    for w in workers: db.add(w)
    db.commit()

    # 2. Create Contacts
    contacts = [
        models.Contact(contact_name="Global Logistics Corp", email_domain="globallogistics.com", total_interactions=45),
        models.Contact(contact_name="TechStream Solutions", email_domain="techstream.io", total_interactions=120),
        models.Contact(contact_name="Precision Engineering", email_domain="precision-eng.uk", total_interactions=85),
        models.Contact(contact_name="Apex Media Group", email_domain="apexmedia.com", total_interactions=32)
    ]
    for c in contacts: db.add(c)
    db.commit()

    # 3. Create Threads
    threads = []
    statuses = ['PROCESSING', 'COMPLETED', 'ON_HOLD', 'PENDING_REVIEW']
    for i in range(1, 21):
        contact = random.choice(contacts)
        t = models.Thread(
            thread_id=f"THR-{1000+i}",
            status=random.choice(statuses),
            contact_id=contact.id,
            subject=f"Inquiry regarding project #{5000+i} - {contact.contact_name}",
            contact_name=contact.contact_name,
            source="OUTLOOK",
            created_at=datetime.utcnow() - timedelta(days=random.randint(0, 30))
        )
        threads.append(t)
        db.add(t)
    db.commit()

    # 4. Create Emails
    for t in threads:
        for j in range(1, random.randint(2, 6)):
            email = models.Email(
                thread_id=t.thread_id,
                email_id=f"MSG-{random.randint(100000, 999999)}",
                subject=t.subject,
                sender=f"sender{j}@{t.contact.email_domain}",
                body=f"This is a professional message regarding thread {t.thread_id}. Please review the attached documents.",
                received_at=datetime.utcnow() - timedelta(hours=random.randint(1, 72)),
                processed=True
            )
            db.add(email)
    db.commit()

    # 5. Create Follow-up Tasks
    for t in random.sample(threads, 5):
        task = models.FollowupTask(
            thread_id=t.thread_id,
            recipient=f"contact@{t.contact.email_domain}",
            status="PENDING",
            due_at=datetime.utcnow() + timedelta(days=2)
        )
        db.add(task)
    db.commit()

    # 6. Audit Logs (Simulate activity with Errors)
    actions = ["LOGIN", "VIEW_THREAD", "UPDATE_STATUS", "DRAFT_REPLY", "FETCH_EMAILS"]
    for i in range(70):
        user = random.choice([super_admin, admin_1] + workers)
        is_error = random.random() < 0.2  # 20% errors
        level = "ERROR" if is_error else "INFO"
        action = random.choice(["CONNECTION_FAILED", "TIMEOUT", "SYNC_ERROR"]) if is_error else random.choice(actions)
        
        log = models.AuditLog(
            user_id=user.id,
            action=action,
            detail=f"Automated system event id {random.randint(1000, 9999)}" if not is_error else "Critical failure during background data synchronization.",
            level=level,
            ip_address="192.168.1." + str(random.randint(1, 254)),
            timestamp=datetime.utcnow() - timedelta(minutes=random.randint(1, 10000))
        )
        db.add(log)
    db.commit()

    print("Seeding completed! Database is now professionally populated.")

if __name__ == "__main__":
    seed_data()
