import httpx
import json

base_url = "http://localhost:8000/api/v1"

# 1. Register or Login as admin
# (Assuming admin@proctor360.com / Admin123! is the default)
try:
    login_res = httpx.post(f"{base_url}/auth/admin/login", json={
        "email": "admin@proctor360.com",
        "password": "Admin123!",
        "mfa_code": "123456" # Static code if set
    })
    print(f"Login Status: {login_res.status_code}")
    if login_res.status_code != 200:
        print(f"Login Failed: {login_res.text}")
        exit(1)
    
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Bulk upload a dummy question
    q_res = httpx.post(f"{base_url}/admin/questions/bulk", headers=headers, json={
        "questions": [
            {
                "prompt": "Test Question",
                "option_a": "A", "option_b": "B", "option_c": "C", "option_d": "D",
                "correct_option": "A", "topic": "test"
            }
        ]
    })
    print(f"Question Upload Status: {q_res.status_code}")
    if q_res.status_code != 200:
        print(f"Question Upload Failed: {q_res.text}")
        exit(1)
    
    q_ids = q_res.json()["question_ids"]

    # 3. Create exam
    exam_res = httpx.post(f"{base_url}/admin/exams", headers=headers, json={
        "code": "TEST-EXAM-1",
        "title": "Test Exam",
        "question_ids": q_ids,
        "student_emails": []
    })
    print(f"Exam Create Status: {exam_res.status_code}")
    print(f"Exam Create Response: {exam_res.text}")

except Exception as e:
    print(f"Error: {e}")
