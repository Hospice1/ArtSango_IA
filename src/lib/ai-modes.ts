import { AiMode } from "@/lib/types";

interface ModeConfig {
  label: string;
  placeholder: string;
  helper: string;
  systemPrompt: string;
}

export const AI_MODE_CONFIG: Record<AiMode, ModeConfig> = {
  description: {
    label: "Description produit",
    placeholder: "Ex: Redige la description d'un sac en raphia fait main...",
    helper: "Cree une description claire, vendeuse et adaptee a une fiche produit.",
    systemPrompt:
      "Tu es ArtSango AI, assistant marketing pour artisans africains. Produis une description produit professionnelle en francais, structuree, concrete, orientee conversion, sans exageration. Mets en avant utilite, matiere, savoir-faire et benefices client.",
  },
  improve_text: {
    label: "Ameliorer texte",
    placeholder: "Colle ton texte ici pour le reformuler...",
    helper: "Reformule et optimise un texte existant pour mieux vendre.",
    systemPrompt:
      "Tu es ArtSango AI. Tu dois ameliorer les textes des artisans. Reecris en francais simple, fluide, convaincant, avec un ton humain et professionnel. Conserve le sens initial et propose une version directement publiable.",
  },
  pricing: {
    label: "Proposer prix",
    placeholder:
      "Decris le produit, les materiaux, le temps de fabrication, le marche cible...",
    helper: "Suggere un prix realiste avec justification courte.",
    systemPrompt:
      "Tu es ArtSango AI, conseiller pricing pour artisans. Analyse les infos fournies et propose une fourchette de prix coherente. Donne un prix recommande, une justification rapide et des conseils pour augmenter la valeur percue.",
  },
  social_posts: {
    label: "Posts reseaux sociaux",
    placeholder: "Ex: Fais 3 posts Instagram pour annoncer ma nouvelle collection...",
    helper: "Genere 3 posts prets a publier avec hashtags.",
    systemPrompt:
      "Tu es ArtSango AI, social media manager pour artisans. Genere exactement 3 posts en francais, chaque post avec un angle different (histoire, benefice client, appel a l'action) et ajoute des hashtags pertinents pour l'Afrique francophone.",
  },
};

export const AI_MODE_OPTIONS = (Object.keys(AI_MODE_CONFIG) as AiMode[]).map((mode) => ({
  value: mode,
  label: AI_MODE_CONFIG[mode].label,
  placeholder: AI_MODE_CONFIG[mode].placeholder,
  helper: AI_MODE_CONFIG[mode].helper,
}));

export function isAiMode(value: string): value is AiMode {
  return value in AI_MODE_CONFIG;
}

export function buildSystemPrompt(mode: AiMode): string {
  return AI_MODE_CONFIG[mode].systemPrompt;
}

export function buildConversationTitle(firstMessage: string): string {
  const normalized = firstMessage.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Nouvelle discussion";
  }

  if (normalized.length <= 60) {
    return normalized;
  }

  return `${normalized.slice(0, 57)}...`;
}
