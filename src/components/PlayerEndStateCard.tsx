import { PlayerEndStateSummary } from '@/game/reporting';
import { PlayerScoreCard } from './PlayerScoreCard';

type PlayerEndStateCardProps = {
  entry: PlayerEndStateSummary;
  itemKeyPrefix?: string;
};

export function PlayerEndStateCard({
  entry,
  itemKeyPrefix = 'player-end-state',
}: PlayerEndStateCardProps) {
  return (
    <PlayerScoreCard playerName={entry.playerName} breakdown={entry.breakdown}>
      <p className="choice-label">Developments</p>
      {entry.developments.length > 0 ? (
        <ul className="inline-note">
          {entry.developments.map((development) => (
            <li
              key={`${itemKeyPrefix}-development-${entry.playerId}-${development.id}`}
            >
              {development.name}: {development.points} VP ({development.effectDescription})
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint-text">None</p>
      )}
      <p className="choice-label">Monuments</p>
      {entry.monuments.length > 0 ? (
        <ul className="inline-note">
          {entry.monuments.map((monument) => (
            <li key={`${itemKeyPrefix}-monument-${entry.playerId}-${monument.id}`}>
              {monument.name}: {monument.points} VP (
              {monument.firstToComplete ? 'first' : 'later'})
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint-text">None</p>
      )}
      <p className="choice-label">Cities</p>
      <p className="scoreboard-row">
        Built: {entry.cities.built}/{entry.cities.total}
      </p>
      <p className="choice-label">Resources</p>
      <p className="scoreboard-row">Food: {entry.resources.food}</p>
      <p className="scoreboard-row">
        Stored goods value: {entry.resources.totalGoodsValue} coins
      </p>
      <ul className="inline-note">
        {entry.resources.goods.map((goods) => (
          <li key={`${itemKeyPrefix}-goods-${entry.playerId}-${goods.name}`}>
            {goods.name}: {goods.quantity} (value {goods.value} coins)
          </li>
        ))}
      </ul>
    </PlayerScoreCard>
  );
}
