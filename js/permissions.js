/**
 * Permissões de acesso por perfil e modo.
 */
export function buildPermissions(user, mode) {
  const role = user?.role ?? 'guest';
  const isGuest = role === 'guest';
  const isAdmin = role === 'admin';
  const isUser = role === 'user';
  const isLoggedIn = !isGuest;

  const canEditScores = isAdmin || (isUser && mode === 'simulation');
  const canAccessSimulation = isLoggedIn;
  const canAccessPool = isLoggedIn;

  return {
    role,
    isGuest,
    isAdmin,
    isUser,
    isLoggedIn,
    mode,
    canEditScores,
    canAccessSimulation,
    canAccessPool,
    canManageSync: isAdmin,
    canAccessAdminSettings: isAdmin,
    canResetScores: isAdmin || (isUser && mode === 'simulation'),
    canFavorite: canEditScores,
    readOnly: !canEditScores,
  };
}
