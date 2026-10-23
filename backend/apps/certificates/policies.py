"""Who may do what with certificates.

- ``certificates.manage_certificates`` (content editors, super administrators):
  templates, per-course rules, revoking and reinstating certificates.
- ``certificates.view_certificates`` (support staff): read every issued
  certificate to help learners.
- Learners: their own certificates.
- Anyone: the public verification of a certificate number, which shows only
  the recipient's name, the course, the issue date and the status.
"""

MANAGE = "certificates.manage_certificates"
VIEW = "certificates.view_certificates"


def _active(user) -> bool:
    return bool(user and user.is_authenticated and user.is_active)


def can_manage(user) -> bool:
    return _active(user) and user.has_perm(MANAGE)


def can_view_all(user) -> bool:
    return can_manage(user) or (_active(user) and user.has_perm(VIEW))
