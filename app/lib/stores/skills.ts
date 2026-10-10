import { atom } from 'nanostores';
import { AVAILABLE_SKILLS, type Skill } from '~/lib/common/skills';
import { getLocalStorage, setLocalStorage } from '~/lib/persistence';

export { AVAILABLE_SKILLS, type Skill } from '~/lib/common/skills';

const SKILLS_STORAGE_KEY = 'bolt_enabled_skills';

// Load enabled skills from localStorage
const getEnabledSkills = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const stored = getLocalStorage(SKILLS_STORAGE_KEY);

  if (stored && Array.isArray(stored)) {
    return stored;
  }

  return [];
};

// Initialize skills store with enabled states
const initializeSkills = (): Skill[] => {
  const enabledIds = getEnabledSkills();

  return AVAILABLE_SKILLS.map((skill) => ({
    ...skill,
    enabled: enabledIds.includes(skill.id),
  }));
};

export const skillsStore = atom<Skill[]>(initializeSkills());

// Update a skill's enabled state
export const toggleSkill = (skillId: string, enabled: boolean) => {
  const skills = skillsStore.get();
  const updatedSkills = skills.map((skill) => (skill.id === skillId ? { ...skill, enabled } : skill));

  skillsStore.set(updatedSkills);

  // Persist to localStorage
  const enabledIds = updatedSkills.filter((s) => s.enabled).map((s) => s.id);
  setLocalStorage(SKILLS_STORAGE_KEY, enabledIds);
};

// Get all enabled skills
export const getEnabledSkillsContent = (): Skill[] => {
  return skillsStore.get().filter((skill) => skill.enabled);
};

// Get skill by ID
export const getSkillById = (skillId: string): Skill | undefined => {
  return skillsStore.get().find((skill) => skill.id === skillId);
};
