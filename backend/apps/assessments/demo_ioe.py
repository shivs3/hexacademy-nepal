"""Demo question bank: an IOE MSc entrance Section A practice paper.

Original questions written for this demo, following the publicly described
pattern of the TU IOE MSc entrance (computer-based MCQ, 100 marks in 2 hours,
10% negative marking). Section A is common to every stream: critical reasoning
(5 questions x 2 marks) and mathematics (40 x 1 mark), with mathematics split
by the published topic weights below. Section B is stream-specific and is not
seeded because its syllabus could not be verified.

Sources (checked 2026-10): edusanjal.com/exam/msc-entrance-tu-ioe/,
ioenotes.edu.np/ioe-msc-entrance-syllabus. Verify against the current official
IOE notice before relying on the pattern.
"""

from html import escape

SOURCE_TAG = "ioe-msc-demo"


def m(latex: str) -> str:
    """An inline maths node, as stored by the rich-text editor."""
    return f'<span data-type="inline-math" data-latex="{escape(latex, quote=True)}"></span>'


def p(*parts: str) -> str:
    return "<p>" + "".join(parts) + "</p>"


SUBJECTS = [
    {
        "slug": "critical-reasoning",
        "name": "Critical Reasoning",
        "description": "Arguments, assumptions and logical deduction (IOE MSc Section A).",
        "topics": [("arguments", "Arguments and assumptions"), ("deduction", "Logical deduction and patterns")],
    },
    {
        "slug": "engineering-mathematics",
        "name": "Engineering Mathematics",
        "description": "Mathematics common to every IOE MSc stream except B.Arch (Section A).",
        "topics": [
            ("basic-mathematics", "Basic mathematics"),
            ("algebra", "Algebra"),
            ("vector-analysis", "Vector analysis"),
            ("calculus", "Calculus"),
            ("statistics-probability", "Statistics and probability"),
            ("trigonometry-logarithm", "Trigonometry and logarithm"),
            ("transforms", "Laplace transform and Fourier series"),
        ],
    },
]

# Each question: (key, subject, topic, difficulty, prompt, [(option, correct)], explanation).
# Critical reasoning carries 2 marks (0.2 negative); mathematics 1 mark (0.1 negative).
REASONING = [
    (
        "cr-01",
        "critical-reasoning",
        "arguments",
        "medium",
        p(
            "After traffic cameras were installed at one busy junction, reported accidents there fell by 30%. "
            "A council member concludes that installing cameras at every major junction will cut accidents "
            "across the city by a similar amount. The conclusion depends on which assumption?"
        ),
        [
            ("Accidents at other junctions have causes that cameras would also deter.", True),
            ("Traffic cameras are cheaper than traffic police.", False),
            ("Accidents at the first junction had been rising before the cameras.", False),
            ("Most drivers prefer routes without cameras.", False),
        ],
        p(
            "The argument generalises from one junction to all of them. That only works if the other "
            "junctions are similar in the way that matters: their accidents are the kind cameras prevent."
        ),
    ),
    (
        "cr-02",
        "critical-reasoning",
        "arguments",
        "medium",
        p(
            "Employees who attend a company's optional evening training receive higher performance ratings "
            "than those who do not. Management concludes that the training improves performance. "
            "Which statement, if true, most weakens this conclusion?"
        ),
        [
            ("Employees who already had high ratings were far more likely to sign up for the training.", True),
            ("The training is taught by experienced managers.", False),
            ("Performance ratings are given once a year by supervisors.", False),
            ("The training is free for every employee.", False),
        ],
        p(
            "If strong performers chose to attend, the higher ratings may reflect who attended rather than "
            "what the training did. That offers an alternative explanation for the correlation."
        ),
    ),
    (
        "cr-03",
        "critical-reasoning",
        "deduction",
        "medium",
        p(
            "All engineers in a team know Python. Some people who know Python also know Rust. "
            "Which statement must be true?"
        ),
        [
            ("Some engineers in the team know Rust.", False),
            ("Everyone who knows Rust is an engineer in the team.", False),
            ("No engineer in the team knows Rust.", False),
            ("None of the other three statements must be true.", True),
        ],
        p(
            "The Python users who know Rust may or may not be engineers in the team, so nothing definite "
            "follows about engineers and Rust. Each of the first three statements could be false."
        ),
    ),
    (
        "cr-04",
        "critical-reasoning",
        "deduction",
        "easy",
        p("What number comes next in the sequence 2, 6, 12, 20, 30, …?"),
        [("42", True), ("40", False), ("36", False), ("44", False)],
        p(
            "The terms are ",
            m("n(n+1)"),
            " for ",
            m("n = 1, 2, 3, \\dots"),
            ". The differences 4, 6, 8, 10 also grow by 2, so the next difference is 12 and the next term is 42.",
        ),
    ),
    (
        "cr-05",
        "critical-reasoning",
        "deduction",
        "easy",
        p("If it rains, the match is cancelled. The match was not cancelled. What can be concluded?"),
        [
            ("It did not rain.", True),
            ("It rained.", False),
            ("The match was moved indoors.", False),
            ("Nothing can be concluded.", False),
        ],
        p(
            "This is modus tollens: from “if P then Q” and “not Q”, it follows that “not P”. "
            "Had it rained, the match would have been cancelled."
        ),
    ),
]

MATHEMATICS = [
    # Basic mathematics: 3
    (
        "ma-01",
        "engineering-mathematics",
        "basic-mathematics",
        "easy",
        p("If ", m("f(x) = 2x + 3"), " and ", m("g(x) = x^2"), ", then ", m("(f \\circ g)(2)"), " equals"),
        [("11", True), ("49", False), ("7", False), ("19", False)],
        p(m("(f \\circ g)(2) = f(g(2)) = f(4) = 2(4) + 3 = 11"), ". The value 49 is ", m("(g \\circ f)(2)"), "."),
    ),
    (
        "ma-02",
        "engineering-mathematics",
        "basic-mathematics",
        "easy",
        p("The distance between the points ", m("(1, 2, 3)"), " and ", m("(4, 6, 3)"), " is"),
        [("5", True), ("7", False), (m("\\sqrt{7}"), False), ("25", False)],
        p(m("\\sqrt{(4-1)^2 + (6-2)^2 + (3-3)^2} = \\sqrt{9 + 16 + 0} = 5"), "."),
    ),
    (
        "ma-03",
        "engineering-mathematics",
        "basic-mathematics",
        "easy",
        p(
            "If ",
            m("n(A) = 20"),
            ", ",
            m("n(B) = 15"),
            " and ",
            m("n(A \\cap B) = 5"),
            ", then ",
            m("n(A \\cup B)"),
            " is",
        ),
        [("30", True), ("35", False), ("40", False), ("25", False)],
        p(m("n(A \\cup B) = n(A) + n(B) - n(A \\cap B) = 20 + 15 - 5 = 30"), "."),
    ),
    # Algebra: 8
    (
        "ma-04",
        "engineering-mathematics",
        "algebra",
        "medium",
        p("The value of ", m("(1 + i)^8"), " is"),
        [("16", True), ("-16", False), (m("16i"), False), ("8", False)],
        p(m("(1+i)^2 = 2i"), ", so ", m("(1+i)^4 = (2i)^2 = -4"), " and ", m("(1+i)^8 = (-4)^2 = 16"), "."),
    ),
    (
        "ma-05",
        "engineering-mathematics",
        "algebra",
        "easy",
        p("The sum of the infinite series ", m("1 + \\frac{1}{3} + \\frac{1}{9} + \\frac{1}{27} + \\cdots"), " is"),
        [(m("\\frac{3}{2}"), True), (m("\\frac{4}{3}"), False), ("2", False), ("3", False)],
        p(
            "A geometric series with ",
            m("a = 1"),
            " and ",
            m("r = \\frac{1}{3}"),
            " sums to ",
            m("\\frac{a}{1-r} = \\frac{1}{2/3} = \\frac{3}{2}"),
            ".",
        ),
    ),
    (
        "ma-06",
        "engineering-mathematics",
        "algebra",
        "medium",
        p("How many distinct arrangements can be made from the letters of the word LEVEL?"),
        [("30", True), ("60", False), ("120", False), ("20", False)],
        p("Five letters with L and E each repeated twice: ", m("\\frac{5!}{2!\\,2!} = \\frac{120}{4} = 30"), "."),
    ),
    (
        "ma-07",
        "engineering-mathematics",
        "algebra",
        "medium",
        p("The determinant of ", m("\\begin{pmatrix} 2 & 0 & 1 \\\\ 1 & 3 & 2 \\\\ 1 & 1 & 1 \\end{pmatrix}"), " is"),
        [("0", True), ("2", False), ("-2", False), ("4", False)],
        p(
            "Expanding along the first row: ",
            m("2(3 \\cdot 1 - 2 \\cdot 1) - 0 + 1(1 \\cdot 1 - 3 \\cdot 1) = 2 - 2 = 0"),
            ".",
        ),
    ),
    (
        "ma-08",
        "engineering-mathematics",
        "algebra",
        "medium",
        p("The eigenvalues of ", m("\\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}"), " are"),
        [("1 and 3", True), ("2 and 2", False), ("0 and 4", False), ("-1 and 3", False)],
        p(
            m("\\det(A - \\lambda I) = (2-\\lambda)^2 - 1 = 0"),
            " gives ",
            m("2 - \\lambda = \\pm 1"),
            ", so ",
            m("\\lambda = 1"),
            " or ",
            m("\\lambda = 3"),
            ". Check: the sum is the trace (4) and the product the determinant (3).",
        ),
    ),
    (
        "ma-09",
        "engineering-mathematics",
        "algebra",
        "medium",
        p(
            "Maximise ",
            m("Z = 3x + 2y"),
            " subject to ",
            m("x + y \\le 4"),
            ", ",
            m("x \\le 3"),
            " and ",
            m("x, y \\ge 0"),
            ". The maximum value of ",
            m("Z"),
            " is",
        ),
        [("11", True), ("12", False), ("9", False), ("8", False)],
        p(
            "The corner points are (0, 0), (3, 0), (3, 1) and (0, 4), giving Z = 0, 9, 11 and 8. "
            "The maximum, 11, is at (3, 1)."
        ),
    ),
    (
        "ma-10",
        "engineering-mathematics",
        "algebra",
        "easy",
        p("The solution set of ", m("|x - 2| < 3"), " is"),
        [
            (m("-1 < x < 5"), True),
            (m("x < 5"), False),
            (m("-5 < x < 1"), False),
            (m("x < -1 \\text{ or } x > 5"), False),
        ],
        p(m("|x - 2| < 3"), " means ", m("-3 < x - 2 < 3"), ", so ", m("-1 < x < 5"), "."),
    ),
    (
        "ma-11",
        "engineering-mathematics",
        "algebra",
        "hard",
        p(
            "A matrix ",
            m("A = PDP^{-1}"),
            " where ",
            m("D = \\operatorname{diag}(1, 2)"),
            ". The trace of ",
            m("A^3"),
            " is",
        ),
        [("9", True), ("27", False), ("3", False), ("6", False)],
        p(
            m("A^3 = PD^3P^{-1}"),
            " and similar matrices share their trace, so ",
            m("\\operatorname{tr}(A^3) = 1^3 + 2^3 = 9"),
            ".",
        ),
    ),
    # Vector analysis: 6
    (
        "ma-12",
        "engineering-mathematics",
        "vector-analysis",
        "easy",
        p(
            "For ",
            m("\\vec a = (1, 2, 2)"),
            " and ",
            m("\\vec b = (2, -1, 2)"),
            ", the dot product ",
            m("\\vec a \\cdot \\vec b"),
            " is",
        ),
        [("4", True), ("6", False), ("0", False), ("8", False)],
        p(m("1 \\cdot 2 + 2 \\cdot (-1) + 2 \\cdot 2 = 2 - 2 + 4 = 4"), "."),
    ),
    (
        "ma-13",
        "engineering-mathematics",
        "vector-analysis",
        "medium",
        p(
            "For ",
            m("\\vec a = (1, 2, 0)"),
            " and ",
            m("\\vec b = (0, 1, 3)"),
            ", the cross product ",
            m("\\vec a \\times \\vec b"),
            " is",
        ),
        [(m("(6, -3, 1)"), True), (m("(6, 3, 1)"), False), (m("(-6, 3, -1)"), False), (m("(2, -3, 1)"), False)],
        p(
            m("(a_2b_3 - a_3b_2,\\; a_3b_1 - a_1b_3,\\; a_1b_2 - a_2b_1) = (6 - 0,\\; 0 - 3,\\; 1 - 0) = (6, -3, 1)"),
            ". The option ",
            m("(-6, 3, -1)"),
            " is ",
            m("\\vec b \\times \\vec a"),
            ".",
        ),
    ),
    (
        "ma-14",
        "engineering-mathematics",
        "vector-analysis",
        "medium",
        p("The gradient of ", m("\\phi = x^2 y + yz"), " at the point ", m("(1, 1, 1)"), " is"),
        [(m("(2, 2, 1)"), True), (m("(2, 1, 1)"), False), (m("(1, 2, 2)"), False), (m("(2, 2, 2)"), False)],
        p(m("\\nabla\\phi = (2xy,\\; x^2 + z,\\; y)"), ", which is ", m("(2, 2, 1)"), " at (1, 1, 1)."),
    ),
    (
        "ma-15",
        "engineering-mathematics",
        "vector-analysis",
        "easy",
        p("The divergence of ", m("\\vec F = (x^2, y^2, z^2)"), " at ", m("(1, 1, 1)"), " is"),
        [("6", True), ("3", False), ("0", False), ("2", False)],
        p(m("\\nabla \\cdot \\vec F = 2x + 2y + 2z"), ", which is 6 at (1, 1, 1)."),
    ),
    (
        "ma-16",
        "engineering-mathematics",
        "vector-analysis",
        "medium",
        p("The curl of ", m("\\vec F = (-y, x, 0)"), " is"),
        [(m("(0, 0, 2)"), True), (m("(0, 0, 0)"), False), (m("(0, 0, -2)"), False), (m("(1, 1, 0)"), False)],
        p(
            "Only the k-component survives: ",
            m("\\frac{\\partial}{\\partial x}(x) - \\frac{\\partial}{\\partial y}(-y) = 1 + 1 = 2"),
            ".",
        ),
    ),
    (
        "ma-17",
        "engineering-mathematics",
        "vector-analysis",
        "hard",
        p(
            "The line integral ",
            m("\\int_C (y\\,dx + x\\,dy)"),
            " along any smooth path ",
            m("C"),
            " from ",
            m("(0, 0)"),
            " to ",
            m("(1, 2)"),
            " equals",
        ),
        [("2", True), ("1", False), ("3", False), ("It depends on the path.", False)],
        p(
            m("y\\,dx + x\\,dy = d(xy)"),
            " is exact, so the integral is path-independent and equals ",
            m("xy\\big|_{(0,0)}^{(1,2)} = 2"),
            ".",
        ),
    ),
    # Calculus: 12
    (
        "ma-18",
        "engineering-mathematics",
        "calculus",
        "easy",
        p(m("\\displaystyle\\lim_{x \\to 0} \\frac{\\sin 3x}{x}"), " equals"),
        [("3", True), ("1", False), ("0", False), (m("\\frac{1}{3}"), False)],
        p(m("\\frac{\\sin 3x}{x} = 3 \\cdot \\frac{\\sin 3x}{3x} \\to 3 \\cdot 1 = 3"), "."),
    ),
    (
        "ma-19",
        "engineering-mathematics",
        "calculus",
        "medium",
        p(m("\\displaystyle\\lim_{x \\to \\infty} \\left(1 + \\frac{2}{x}\\right)^{x}"), " equals"),
        [(m("e^2"), True), (m("e"), False), ("1", False), (m("2e"), False)],
        p("Using ", m("\\lim_{x\\to\\infty}(1 + \\frac{k}{x})^x = e^k"), " with ", m("k = 2"), "."),
    ),
    (
        "ma-20",
        "engineering-mathematics",
        "calculus",
        "easy",
        p("At ", m("x = 0"), ", the function ", m("f(x) = |x|"), " is"),
        [
            ("continuous but not differentiable", True),
            ("differentiable but not continuous", False),
            ("both continuous and differentiable", False),
            ("neither continuous nor differentiable", False),
        ],
        p(
            "Both one-sided limits are 0, so f is continuous; the left derivative is −1 and the right "
            "derivative is +1, so it is not differentiable there."
        ),
    ),
    (
        "ma-21",
        "engineering-mathematics",
        "calculus",
        "easy",
        p(m("\\frac{d}{dx}\\left(x e^{x}\\right)"), " equals"),
        [(m("e^{x}(1 + x)"), True), (m("x e^{x}"), False), (m("e^{x}"), False), (m("e^{x}(x - 1)"), False)],
        p("Product rule: ", m("1 \\cdot e^x + x \\cdot e^x = e^x(1 + x)"), "."),
    ),
    (
        "ma-22",
        "engineering-mathematics",
        "calculus",
        "medium",
        p("If ", m("z = x^2 y + \\sin y"), ", then ", m("\\frac{\\partial^2 z}{\\partial x\\,\\partial y}"), " equals"),
        [(m("2x"), True), (m("2y"), False), (m("2xy + \\cos y"), False), (m("x^2 + \\cos y"), False)],
        p(
            m("\\frac{\\partial z}{\\partial y} = x^2 + \\cos y"),
            ", and differentiating with respect to x gives ",
            m("2x"),
            ".",
        ),
    ),
    (
        "ma-23",
        "engineering-mathematics",
        "calculus",
        "medium",
        p(m("\\displaystyle\\int_0^1 x e^{x}\\,dx"), " equals"),
        [("1", True), (m("e"), False), (m("e - 1"), False), (m("e + 1"), False)],
        p("By parts: ", m("\\int x e^x\\,dx = x e^x - e^x"), ", so the value is ", m("(e - e) - (0 - 1) = 1"), "."),
    ),
    (
        "ma-24",
        "engineering-mathematics",
        "calculus",
        "medium",
        p(m("\\displaystyle\\int_0^{\\pi/2} \\sin^2 x\\,dx"), " equals"),
        [(m("\\frac{\\pi}{4}"), True), (m("\\frac{\\pi}{2}"), False), ("1", False), (m("\\frac{1}{2}"), False)],
        p(
            m("\\sin^2 x = \\frac{1 - \\cos 2x}{2}"),
            ", whose integral over ",
            m("[0, \\frac{\\pi}{2}]"),
            " is ",
            m("\\frac{1}{2} \\cdot \\frac{\\pi}{2} - 0 = \\frac{\\pi}{4}"),
            ".",
        ),
    ),
    (
        "ma-25",
        "engineering-mathematics",
        "calculus",
        "easy",
        p("The area enclosed between ", m("y = x"), " and ", m("y = x^2"), " is"),
        [(m("\\frac{1}{6}"), True), (m("\\frac{1}{3}"), False), (m("\\frac{1}{2}"), False), (m("\\frac{5}{6}"), False)],
        p(
            "The curves meet at x = 0 and x = 1, where ",
            m("x \\ge x^2"),
            ". Area ",
            m("= \\int_0^1 (x - x^2)\\,dx = \\frac{1}{2} - \\frac{1}{3} = \\frac{1}{6}"),
            ".",
        ),
    ),
    (
        "ma-26",
        "engineering-mathematics",
        "calculus",
        "medium",
        p("The function ", m("f(x) = x^3 - 3x"), " has a local maximum at"),
        [(m("x = -1"), True), (m("x = 1"), False), (m("x = 0"), False), (m("x = 2"), False)],
        p(
            m("f'(x) = 3x^2 - 3 = 0"),
            " at ",
            m("x = \\pm 1"),
            ". Since ",
            m("f''(x) = 6x"),
            " is negative at ",
            m("x = -1"),
            ", that point is a local maximum.",
        ),
    ),
    (
        "ma-27",
        "engineering-mathematics",
        "calculus",
        "easy",
        p("The solution of ", m("\\frac{dy}{dx} = 2y"), " with ", m("y(0) = 3"), " is"),
        [(m("y = 3e^{2x}"), True), (m("y = 2e^{3x}"), False), (m("y = 3 + 2x"), False), (m("y = e^{2x} + 2"), False)],
        p("Separating variables gives ", m("y = Ce^{2x}"), ", and ", m("y(0) = 3"), " fixes ", m("C = 3"), "."),
    ),
    (
        "ma-28",
        "engineering-mathematics",
        "calculus",
        "medium",
        p("An integrating factor of ", m("\\frac{dy}{dx} + \\frac{y}{x} = x^2"), " (for ", m("x > 0"), ") is"),
        [(m("x"), True), (m("\\frac{1}{x}"), False), (m("e^{x}"), False), (m("\\ln x"), False)],
        p(m("e^{\\int \\frac{1}{x}\\,dx} = e^{\\ln x} = x"), "."),
    ),
    (
        "ma-29",
        "engineering-mathematics",
        "calculus",
        "medium",
        p("The general solution of ", m("y'' - 5y' + 6y = 0"), " is"),
        [
            (m("y = C_1 e^{2x} + C_2 e^{3x}"), True),
            (m("y = C_1 e^{-2x} + C_2 e^{-3x}"), False),
            (m("y = (C_1 + C_2 x)e^{5x}"), False),
            (m("y = C_1 \\cos 2x + C_2 \\sin 3x"), False),
        ],
        p("The auxiliary equation ", m("m^2 - 5m + 6 = 0"), " has roots 2 and 3."),
    ),
    # Statistics and probability: 3
    (
        "ma-30",
        "engineering-mathematics",
        "statistics-probability",
        "easy",
        p("Two fair dice are thrown. The probability that the sum is 7 is"),
        [
            (m("\\frac{1}{6}"), True),
            (m("\\frac{7}{36}"), False),
            (m("\\frac{1}{12}"), False),
            (m("\\frac{5}{36}"), False),
        ],
        p(
            "Six of the 36 equally likely outcomes sum to 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1). ",
            m("\\frac{6}{36} = \\frac{1}{6}"),
            ".",
        ),
    ),
    (
        "ma-31",
        "engineering-mathematics",
        "statistics-probability",
        "medium",
        p("The population standard deviation of 2, 4, 4, 4, 5, 5, 7, 9 is"),
        [("2", True), ("4", False), (m("\\sqrt{2}"), False), ("5", False)],
        p(
            "The mean is 40/8 = 5. The squared deviations 9, 1, 1, 1, 0, 0, 4, 16 sum to 32, so the variance is "
            "32/8 = 4 and the standard deviation is 2."
        ),
    ),
    (
        "ma-32",
        "engineering-mathematics",
        "statistics-probability",
        "easy",
        p(
            "A and B are independent events with ",
            m("P(A) = 0.5"),
            " and ",
            m("P(B) = 0.4"),
            ". Then ",
            m("P(A \\cup B)"),
            " is",
        ),
        [("0.7", True), ("0.9", False), ("0.2", False), ("0.5", False)],
        p(m("P(A \\cup B) = P(A) + P(B) - P(A)P(B) = 0.5 + 0.4 - 0.2 = 0.7"), "."),
    ),
    # Trigonometry and logarithm: 4
    (
        "ma-33",
        "engineering-mathematics",
        "trigonometry-logarithm",
        "medium",
        p("The value of ", m("\\sin 75^\\circ"), " is"),
        [
            (m("\\frac{\\sqrt{6} + \\sqrt{2}}{4}"), True),
            (m("\\frac{\\sqrt{6} - \\sqrt{2}}{4}"), False),
            (m("\\frac{\\sqrt{3} + 1}{2}"), False),
            (m("\\frac{\\sqrt{3}}{2}"), False),
        ],
        p(
            m(
                "\\sin(45^\\circ + 30^\\circ) = \\frac{\\sqrt2}{2}\\cdot\\frac{\\sqrt3}{2}"
                " + \\frac{\\sqrt2}{2}\\cdot\\frac{1}{2} = \\frac{\\sqrt6 + \\sqrt2}{4}"
            ),
            ". The second option is ",
            m("\\sin 15^\\circ"),
            ".",
        ),
    ),
    (
        "ma-34",
        "engineering-mathematics",
        "trigonometry-logarithm",
        "easy",
        p("The general solution of ", m("\\tan x = 1"), " is"),
        [
            (m("x = n\\pi + \\frac{\\pi}{4}"), True),
            (m("x = 2n\\pi + \\frac{\\pi}{4}"), False),
            (m("x = n\\pi \\pm \\frac{\\pi}{4}"), False),
            (m("x = \\frac{n\\pi}{4}"), False),
        ],
        p(
            "Tangent has period π and ",
            m("\\tan\\frac{\\pi}{4} = 1"),
            ", so ",
            m("x = n\\pi + \\frac{\\pi}{4}"),
            ", n an integer.",
        ),
    ),
    (
        "ma-35",
        "engineering-mathematics",
        "trigonometry-logarithm",
        "easy",
        p("The value of ", m("\\log_2 8 + \\log_3 \\frac{1}{9}"), " is"),
        [("1", True), ("5", False), ("-1", False), ("0", False)],
        p(m("\\log_2 8 = 3"), " and ", m("\\log_3 \\frac{1}{9} = -2"), ", so the sum is 1."),
    ),
    (
        "ma-36",
        "engineering-mathematics",
        "trigonometry-logarithm",
        "easy",
        p("Given ", m("\\log_{10} 2 = 0.3010"), ", the value of ", m("\\log_{10} 5"), " is"),
        [("0.6990", True), ("0.3010", False), ("0.6020", False), ("0.5000", False)],
        p(m("\\log_{10} 5 = \\log_{10}\\frac{10}{2} = 1 - 0.3010 = 0.6990"), "."),
    ),
    # Transforms: 4
    (
        "ma-37",
        "engineering-mathematics",
        "transforms",
        "easy",
        p("The Laplace transform of ", m("e^{3t}"), " is (for ", m("s > 3"), ")"),
        [
            (m("\\frac{1}{s - 3}"), True),
            (m("\\frac{1}{s + 3}"), False),
            (m("\\frac{3}{s}"), False),
            (m("\\frac{s}{s^2 + 9}"), False),
        ],
        p(m("\\mathcal{L}\\{e^{at}\\} = \\frac{1}{s - a}"), " for ", m("s > a"), "."),
    ),
    (
        "ma-38",
        "engineering-mathematics",
        "transforms",
        "easy",
        p("The Laplace transform of ", m("t^2"), " is"),
        [
            (m("\\frac{2}{s^3}"), True),
            (m("\\frac{1}{s^3}"), False),
            (m("\\frac{2}{s^2}"), False),
            (m("\\frac{6}{s^4}"), False),
        ],
        p(m("\\mathcal{L}\\{t^n\\} = \\frac{n!}{s^{n+1}}"), ", so ", m("\\mathcal{L}\\{t^2\\} = \\frac{2}{s^3}"), "."),
    ),
    (
        "ma-39",
        "engineering-mathematics",
        "transforms",
        "medium",
        p("The inverse Laplace transform of ", m("\\frac{1}{s^2 + 4}"), " is"),
        [
            (m("\\frac{1}{2}\\sin 2t"), True),
            (m("\\sin 2t"), False),
            (m("\\cos 2t"), False),
            (m("\\frac{1}{4}\\sin 4t"), False),
        ],
        p(
            m("\\mathcal{L}\\{\\sin at\\} = \\frac{a}{s^2 + a^2}"),
            "; with ",
            m("a = 2"),
            ", ",
            m("\\frac{1}{s^2 + 4} = \\frac{1}{2}\\cdot\\frac{2}{s^2 + 4}"),
            ".",
        ),
    ),
    (
        "ma-40",
        "engineering-mathematics",
        "transforms",
        "medium",
        p("The Fourier series of ", m("f(x) = x"), " on ", m("(-\\pi, \\pi)"), " contains"),
        [
            ("only sine terms", True),
            ("only cosine terms and a constant", False),
            ("both sine and cosine terms", False),
            ("only a constant term", False),
        ],
        p(
            m("f(x) = x"),
            " is odd, so ",
            m("a_0"),
            " and every ",
            m("a_n"),
            " vanish, leaving only the ",
            m("b_n \\sin nx"),
            " terms.",
        ),
    ),
]

REASONING_MARKS = ("2", "0.2")
MATHEMATICS_MARKS = ("1", "0.1")

EXAM = {
    "slug": "demo-ioe-msc-section-a-practice",
    "title": "IOE MSc Entrance — Section A Practice (Demo)",
    "duration_minutes": 60,
    "instructions": (
        "<p><strong>Demo practice test.</strong> These are original practice questions written for this "
        "demo, not past or official IOE questions. Replace or review them before launch.</p>"
        "<p>This paper follows the publicly described Section A pattern of the TU IOE MSc entrance: "
        "5 critical-reasoning questions worth 2 marks each and 40 mathematics questions worth 1 mark each, "
        "50 marks in total. Each wrong answer deducts 10% of the question's marks; unanswered questions "
        "score zero. The full entrance adds a 50-mark stream-specific Section B and lasts 2 hours, so this "
        "half-paper allows 60 minutes.</p>"
        "<p>Check the current pattern in the official IOE entrance notice before you rely on it.</p>"
    ),
}
