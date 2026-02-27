import sys
import traceback
from backend.app.core.db import SessionLocal
from backend.app.models.db_models import ServerModel, MCPToolModel, BaseURLModel

def test():
    try:
        s = SessionLocal()
        print("Testing ServerModel...")
        s.query(ServerModel).first()
        print("Testing MCPToolModel...")
        s.query(MCPToolModel).first()
        print("Testing BaseURLModel...")
        s.query(BaseURLModel).first()
        print("ALL OK")
    except Exception as e:
        print("ERROR:")
        traceback.print_exc()

if __name__ == "__main__":
    test()
