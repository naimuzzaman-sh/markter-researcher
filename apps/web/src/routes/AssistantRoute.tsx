import AgentChat from '@/components/AgentChat';

/**
 * /assistant — full-viewport chat. AgentChat owns its own masthead + layout
 * (no EditorialLayout wrapper) so the sticky input bar stays on screen no
 * matter the message list length.
 */
export default function AssistantRoute() {
  return <AgentChat />;
}
