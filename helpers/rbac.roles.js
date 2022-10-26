// these should match with db enums
export const ROLE_DEFAULT = 0;
export const ROLE_SUPER_CURATOR = 101;
export const ROLE_SENIOR_CURATOR = 102;
export const ROLE_JUNIOR_CURATOR = 103;

export const isValidCuratorRole = (role) =>
  role === ROLE_SUPER_CURATOR ||
  role === ROLE_SENIOR_CURATOR ||
  role === ROLE_JUNIOR_CURATOR;
