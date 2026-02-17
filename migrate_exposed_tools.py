from app.core.db import engine
from app.models.db_models import Base
# Make sure all models are imported so they are registered in Base.metadata
from app.models.db_models import *

def migrate():
    print("Creating tables via SQLAlchemy...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully.")

if __name__ == "__main__":
    migrate()
