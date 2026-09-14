"""Golden set for eval/run_eval.py, checked against the bundled sample
transcripts in data/sample_transcripts/.

`messy_budget_meeting.txt` is the important one: it contains an action item
that is explicitly discussed as unassigned ("no one's on it yet") with no
date mentioned at all. A model that hallucinates fields will assign it to
whichever of the two speakers (Jordan or Alex) it defaults to guessing —
this case exists specifically to catch that.
"""

GOLDEN_SET = [
    {
        "transcript_file": "product_launch_standup.txt",
        "expected_decision_keywords": ["three-tier", "three tier"],
        "expected_action_items": [
            {"owner_contains": "priya", "due_date_contains": "wednesday"},
            {"owner_contains": "dev", "due_date_contains": "friday"},
            {"owner_contains": "marcus", "due_date_contains": "monday"},
        ],
    },
    {
        "transcript_file": "messy_budget_meeting.txt",
        "expected_decision_keywords": ["freeze"],
        # At least one action item must have NO owner and NO due date —
        # the transcript never states either. A model that invents one to
        # "complete" the schema fails this check.
        "expect_an_unassigned_action_item": True,
    },
]
