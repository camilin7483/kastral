import os
from typing import List


class Settings:
    PROJECT_NAME: str = "Kastral File Processing API"
    VERSION: str = "1.0.0"

    ALLOWED_ORIGINS: List[str] = [
        origin.strip()
        for origin in os.getenv(
            "ALLOWED_ORIGINS", "http://localhost:3000,https://kastral.app"
        ).split(",")
        if origin.strip()
    ]

    TEMP_ROOT: str = os.getenv("TEMP_ROOT", "/tmp/kastral-tasks")
    MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "50"))
    MAX_CONCURRENT_TASKS: int = int(os.getenv("MAX_CONCURRENT_TASKS", "2"))
    TASK_TIMEOUT_SECONDS: int = int(os.getenv("TASK_TIMEOUT_SECONDS", "60"))
    TEMP_CLEANUP_MINUTES: int = int(os.getenv("TEMP_CLEANUP_MINUTES", "15"))


settings = Settings()
