"""Golden Q&A set for eval/run_eval.py, written against the bundled sample data
in data/sample/ (about_northwind.txt, employee_roster.csv, employee_handbook.pdf).

Each case checks two things independently:
- retrieval: did the chunk from `expected_source` actually get retrieved?
  (only meaningful when `expect_answerable` is True)
- answer quality: does the generated answer satisfy `answer_criteria`,
  as judged by a second LLM call in run_eval.py?
"""

GOLDEN_SET = [
    {
        "question": "When and where was Northwind Robotics founded?",
        "expected_source": "about_northwind.txt",
        "expect_answerable": True,
        "answer_criteria": "The answer should say it was founded in 2019 in Austin, Texas.",
    },
    {
        "question": "What is Northwind Robotics' mission statement?",
        "expected_source": "about_northwind.txt",
        "expect_answerable": True,
        "answer_criteria": (
            "The answer should mention making warehouse automation accessible "
            "to businesses of any size, with modular hardware and transparent pricing."
        ),
    },
    {
        "question": "How many vacation days do full-time employees get per year?",
        "expected_source": "employee_handbook.pdf",
        "expect_answerable": True,
        "answer_criteria": "The answer should state 18 days of paid vacation per calendar year.",
    },
    {
        "question": "What is the remote work policy?",
        "expected_source": "employee_handbook.pdf",
        "expect_answerable": True,
        "answer_criteria": "The answer should say up to 2 days per week with manager approval.",
    },
    {
        "question": "Which employees work in the Quality Assurance department?",
        "expected_source": "employee_roster.csv",
        "expect_answerable": True,
        "answer_criteria": "The answer should name Priya Shah and Grace Lin.",
    },
    {
        "question": "What year did Tomas Novak start at the company?",
        "expected_source": "employee_roster.csv",
        "expect_answerable": True,
        "answer_criteria": "The answer should state 2020.",
    },
    {
        "question": "What is Northwind Robotics' stock ticker symbol?",
        "expected_source": None,
        "expect_answerable": False,
        "answer_criteria": (
            "The answer should say it does not have enough information to answer, "
            "rather than inventing a stock ticker symbol. It does not need to "
            "mention that the company is privately held."
        ),
    },
]
