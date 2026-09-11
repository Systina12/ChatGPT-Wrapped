import { MessageCircle, Sparkles } from "lucide-react";
import { formatCount } from "../../lib/report/format";
import type { ConversationDatum, WordDatum } from "../../lib/report/selectors";
import { EmptyChart } from "../ui/EmptyChart";
import { Panel } from "../ui/Panel";

interface DetailSectionProps {
  conversations: ConversationDatum[];
  words: WordDatum[];
}

export function DetailSection({ conversations, words }: DetailSectionProps) {
  return (
    <section className="detail-grid">
      <Panel title="Conversations you stayed with" subtitle="Longest threads by message count" icon={<MessageCircle size={18} />}>
        {conversations.length ? (
          <div className="conversation-list">
            {conversations.map((item) => (
              <ConversationRow key={item.key} item={item} />
            ))}
          </div>
        ) : (
          <EmptyChart message="No conversation summaries were found." />
        )}
      </Panel>

      <Panel title="Words that kept returning" subtitle="Frequent terms in your messages" icon={<Sparkles size={18} />}>
        {words.length ? (
          <div className="word-cloud" aria-label="Frequent words">
            {words.map((item) => (
              <span
                key={item.term}
                style={{ fontSize: `${item.sizeRem}rem` }}
                title={`${item.term}: ${formatCount(item.count)} occurrences`}
              >
                {item.term}
              </span>
            ))}
          </div>
        ) : (
          <EmptyChart message="No frequent terms were found." />
        )}
      </Panel>
    </section>
  );
}

function ConversationRow({ item }: { item: ConversationDatum }) {
  return (
    <div className="conversation-row">
      <span className="conversation-rank">{item.rank}</span>
      <div className="conversation-copy">
        <strong>{item.title}</strong>
        <span>{item.date}</span>
      </div>
      <span className="conversation-count">
        {formatCount(item.messageCount)} <small>msgs</small>
      </span>
    </div>
  );
}
