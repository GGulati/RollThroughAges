import { GameState } from '../game';
import { PlayerEndStateSummary } from '../reporting';
import { isFirstToCompleteMonument } from './buildEngine';
import { getDevelopment } from './developmentEngine';
import { getGoodsValue } from './goodsEngine';
import { getScoreBreakdown } from './scoreEngine';

export function getPlayerEndStateSummaries(game: GameState): PlayerEndStateSummary[] {
  return game.state.players.map((player) => {
    const config = game.settings.players.find((entry) => entry.id === player.id);
    const breakdown = getScoreBreakdown(player, game.state.players, game.settings);
    const goods = game.settings.goodsTypes.map((goodsType) => {
      const quantity = player.goods.get(goodsType) ?? 0;
      return {
        name: goodsType.name,
        quantity,
        value: getGoodsValue(goodsType, quantity),
      };
    });
    const developments = player.developments
      .map((developmentId) => {
        const development = getDevelopment(developmentId, game.settings);
        if (!development) {
          return null;
        }
        return {
          id: development.id,
          name: development.name,
          points: development.points,
          effectDescription: development.effectDescription,
        };
      })
      .filter((entry) => entry !== null);
    const monuments = game.settings.monumentDefinitions
      .map((monument) => {
        const progress = player.monuments[monument.id];
        if (!progress?.completed) {
          return null;
        }
        const firstToComplete = isFirstToCompleteMonument(
          monument.id,
          player,
          game.state.players,
        );
        return {
          id: monument.id,
          name: monument.requirements.name,
          points: firstToComplete ? monument.firstPoints : monument.laterPoints,
          firstToComplete,
        };
      })
      .filter((entry) => entry !== null);

    return {
      playerId: player.id,
      playerName: config?.name ?? player.id,
      total: breakdown.total,
      breakdown,
      cities: {
        built: player.cities.filter((city) => city.completed).length,
        total: player.cities.length,
      },
      resources: {
        food: player.food,
        goods,
        totalGoodsValue: goods.reduce((sum, entry) => sum + entry.value, 0),
      },
      developments,
      monuments,
    };
  });
}
