"""Regenerates the bundled demo files in data/sample/.

The three files are committed to the repo already, so a student doesn't need
to run this — it's here so the sample data is transparent and reproducible
rather than a mystery binary, and so you can tweak the content and regenerate.

    python data/generate_sample_data.py
"""

import csv
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

SAMPLE_DIR = Path(__file__).parent / "sample"

ABOUT_TXT = """About Northwind Robotics

Northwind Robotics was founded in 2019 in Austin, Texas by a small team of
robotics engineers who wanted to make warehouse automation affordable for
mid-sized businesses, not just large enterprises.

Our flagship product is the Northwind Scout, a modular warehouse robot that
handles inventory scanning, pallet transport, and shelf restocking. The Scout
is designed to be deployed without rebuilding a warehouse's existing layout.

Mission Statement
Our mission is to make advanced warehouse automation accessible to any
business, regardless of size, by keeping hardware modular and pricing
transparent.

Frequently Asked Questions

Q: Does the Scout require special warehouse infrastructure?
A: No. The Scout navigates using onboard cameras and LIDAR, so it does not
require floor markers, beacons, or rewiring.

Q: What is the battery life of the Scout?
A: A fully charged Scout runs for approximately 10 hours of continuous
operation before needing to return to its charging dock.

Q: Is Northwind Robotics a public company?
A: No, Northwind Robotics is privately held and has not announced plans for
an IPO.
"""

ROSTER_ROWS = [
    {"name": "Ada Kumar", "department": "Engineering", "role": "Robotics Engineer", "start_year": "2020"},
    {"name": "Marcus Webb", "department": "Engineering", "role": "Firmware Engineer", "start_year": "2021"},
    {"name": "Priya Shah", "department": "Quality Assurance", "role": "QA Lead", "start_year": "2019"},
    {"name": "Diego Fernandez", "department": "Sales", "role": "Account Executive", "start_year": "2022"},
    {"name": "Grace Lin", "department": "Quality Assurance", "role": "Test Engineer", "start_year": "2023"},
    {"name": "Tomas Novak", "department": "Operations", "role": "Warehouse Ops Manager", "start_year": "2020"},
]

HANDBOOK_SECTIONS = [
    ("Employee Handbook Excerpt — Northwind Robotics", None),
    (
        "Paid Time Off",
        "Full-time employees accrue 18 days of paid vacation per calendar year, "
        "in addition to 10 paid holidays. Unused vacation days roll over up to a "
        "maximum of 5 days into the following year.",
    ),
    (
        "Remote Work Policy",
        "Employees may work remotely up to 2 days per week with manager approval. "
        "Fully remote arrangements are evaluated on a case-by-case basis by the "
        "employee's department head and HR.",
    ),
    (
        "Code of Conduct",
        "All employees are expected to treat colleagues, customers, and partners "
        "with respect. Harassment of any kind will result in disciplinary action, "
        "up to and including termination.",
    ),
    (
        "Expense Reimbursement",
        "Business expenses under $75 may be submitted with a receipt through the "
        "expense portal and are typically reimbursed within 5 business days.",
    ),
]


def write_txt() -> None:
    (SAMPLE_DIR / "about_northwind.txt").write_text(ABOUT_TXT, encoding="utf-8")


def write_csv() -> None:
    path = SAMPLE_DIR / "employee_roster.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "department", "role", "start_year"])
        writer.writeheader()
        writer.writerows(ROSTER_ROWS)


def write_pdf() -> None:
    path = SAMPLE_DIR / "employee_handbook.pdf"
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=LETTER)
    story = []

    title, _ = HANDBOOK_SECTIONS[0]
    story.append(Paragraph(title, styles["Title"]))
    story.append(Spacer(1, 18))

    for heading, body in HANDBOOK_SECTIONS[1:]:
        story.append(Paragraph(heading, styles["Heading2"]))
        story.append(Paragraph(body, styles["BodyText"]))
        story.append(Spacer(1, 12))

    doc.build(story)


def main() -> None:
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    write_txt()
    write_csv()
    write_pdf()
    print(f"Wrote sample files to {SAMPLE_DIR}")


if __name__ == "__main__":
    main()
