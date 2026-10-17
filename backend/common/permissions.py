from rest_framework.permissions import BasePermission


def HasPerm(*perms: str, any_of: bool = False) -> type[BasePermission]:  # noqa: N802 - reads like a class
    """Permission class factory: `permission_classes = [HasPerm("cms.manage_pages")]`."""

    class _HasPerm(BasePermission):
        message = "You do not have permission to perform this action."

        def has_permission(self, request, view):
            user = request.user
            if not (user and user.is_authenticated):
                return False
            checks = (user.has_perm(p) for p in perms)
            return any(checks) if any_of else all(checks)

    _HasPerm.__name__ = f"HasPerm({', '.join(perms)})"
    return _HasPerm


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
