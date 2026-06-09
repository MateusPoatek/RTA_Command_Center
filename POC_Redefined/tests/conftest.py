"""Make POC_Redefined importable so tests can `import verint_normalize` etc.

Works under both pytest and `python -m unittest` regardless of cwd.
"""

import os
import sys

_POC_REDEFINED = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _POC_REDEFINED not in sys.path:
    sys.path.insert(0, _POC_REDEFINED)
