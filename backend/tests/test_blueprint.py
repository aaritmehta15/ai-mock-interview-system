import os
import sys
import asyncio
import io

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.blueprint_service import (
    generate_blueprint,
    extract_text_from_pdf,
    InterviewBlueprint
)
from pypdf import PdfWriter

async def test_blueprint_generation():
    print("--- Running test_blueprint_generation ---")
    mock_resume = """
    Aarit Mehta - AI & Systems Engineer
    Experience: Built distributed event processing pipelines using Kafka, Redis, and FastAPI.
    Designed real-time WebRTC audio agents and deployed on Kubernetes.
    Languages: Python, Go, TypeScript, C++.
    """
    mock_jd = """
    Target Role: Distributed Systems & AI Infrastructure Engineer at Stripe.
    Requirements: Expertise in high-throughput message streaming, horizontal scaling,
    concurrency patterns, and fault tolerance.
    """

    bp = await generate_blueprint(
        company="Stripe",
        role="Distributed Systems Engineer",
        resume_text=mock_resume,
        jd_text=mock_jd,
        seniority="Senior"
    )

    assert isinstance(bp, InterviewBlueprint), "Output must be an InterviewBlueprint instance"
    assert bp.company == "Stripe", f"Expected Stripe, got {bp.company}"
    assert len(bp.questions) >= 3, f"Expected at least 3 questions, got {len(bp.questions)}"
    assert len(bp.keywords) >= 3, f"Expected keywords, got {bp.keywords}"

    for q in bp.questions:
        assert q.id.startswith("q_"), f"Question id should start with q_, got {q.id}"
        assert len(q.text) > 15, f"Question text too short: {q.text}"
        assert len(q.assertions) == 3, f"Expected 3 binary assertions for {q.id}, got {len(q.assertions)}"
        total_weight = sum(a.weight for a in q.assertions)
        assert abs(total_weight - 1.0) < 0.05, f"Assertion weights must sum to 1.0 for {q.id}, got {total_weight}"

    print(f"[OK] Generated Blueprint ID: {bp.blueprint_id}")
    print(f"[OK] Extracted Keywords: {bp.keywords[:5]}")
    print(f"[OK] Question 1 ({bp.questions[0].competency}): {bp.questions[0].text[:80]}...")

def test_pdf_extraction():
    print("--- Running test_pdf_extraction ---")
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    pdf_bytes = io.BytesIO()
    writer.write(pdf_bytes)
    
    extracted = extract_text_from_pdf(pdf_bytes.getvalue())
    assert isinstance(extracted, str), "Extraction must return string"
    print("[OK] PDF extraction handled cleanly without errors")

if __name__ == "__main__":
    test_pdf_extraction()
    asyncio.run(test_blueprint_generation())
    print("ALL BLUEPRINT TESTS PASSED! [OK]")
