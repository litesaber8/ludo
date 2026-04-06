"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Player, Piece, Color, GameState, BuffType } from '../types/game';
import { createInitialPlayers, getGlobalIndex, BUFF_LOCATIONS, SAFE_ZONES, PlayerConfig, COLORS } from '../lib/game-logic';

export default function LudoGame() {
  const [gameStarted, setGameStarted] = useState(false);
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>(
    COLORS.map((color, index) => ({
      color,
      isBot: index !== 0,
      isActive: true,
    }))
  );

  const [gameState, setGameState] = useState<GameState>({
    players: [],
    currentPlayerIndex: 0,
    diceValue: 0,
    isGameOver: false,
    gameLog: ['Game started!'],
    winners: [],
  });
  const [isRolling, setIsRolling] = useState(false);
  const [waitingForMove, setWaitingForMove] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);
  const [hoveredTile, setHoveredTile] = useState<{ globalIdx?: number; color?: Color; localPos?: number } | null>(null);
  const [focusedTile, setFocusedTile] = useState<{ globalIdx: number; color?: Color; localPos?: number } | null>(null);
  const [attackingPieceId, setAttackingPieceId] = useState<string | null>(null);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex] || { name: 'Player', color: 'red', pieces: [], isBot: false };

  const rollDice = useCallback(() => {
    if (isRolling || waitingForMove || gameState.isGameOver) return;
    setIsRolling(true);
    setSelectedPieceId(null);
    
    setTimeout(() => {
      const newVal = Math.floor(Math.random() * 6) + 1;
      setIsRolling(false);
      setGameState(prev => ({ 
        ...prev, 
        diceValue: newVal,
        gameLog: [`${currentPlayer.name} rolled a ${newVal}`, ...prev.gameLog].slice(0, 10)
      }));

      const canMove = currentPlayer.pieces.some(p => {
        if (p.position === -1 && newVal === 6) return true;
        if (p.position >= 0 && p.position + newVal <= 57) return true;
        return false;
      });

      if (!canMove) {
        setGameState(prev => ({
          ...prev,
          gameLog: [`No possible moves for ${currentPlayer.name}`, ...prev.gameLog].slice(0, 10),
          currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length
        }));
      } else {
        setWaitingForMove(true);
      }
    }, 600);
  }, [isRolling, waitingForMove, currentPlayer, gameState.currentPlayerIndex, gameState.players.length]);

  const movePiece = (pieceId: string) => {
    if (!waitingForMove) return;

    const playerIndex = gameState.currentPlayerIndex;
    const player = gameState.players[playerIndex];
    const pieceIndex = player.pieces.findIndex(p => p.id === pieceId);
    if (pieceIndex === -1) return;
    
    const piece = player.pieces[pieceIndex];
    const roll = gameState.diceValue;

    let newPos = piece.position;
    if (piece.position === -1) {
      if (roll === 6) newPos = 0;
      else return;
    } else {
      if (piece.position + roll > 57) return;
      newPos += roll;
    }

    const globalIdx = getGlobalIndex(newPos, piece.color);
    let updatedPiece = { ...piece, position: newPos };
    let newLog = [`${player.name} moved piece to ${newPos}`];

    setSelectedPieceId(piece.id);

    if (newPos >= 0 && newPos < 52) {
      const buffType = BUFF_LOCATIONS[globalIdx];
      if (buffType) {
        if (buffType === 'BUFF_HEAL') {
          updatedPiece.hp += 1;
          newLog.push(`✨ Piece healed! HP: ${updatedPiece.hp}`);
        } else if (buffType === 'BUFF_ATTACK') {
          updatedPiece.attack += 1;
          newLog.push(`⚔️ Attack increased! Damage: ${updatedPiece.attack}`);
        } else if (buffType === 'BUFF_RANGE') {
          updatedPiece.range += 1;
          newLog.push(`🎯 Range increased! Range: ${updatedPiece.range}`);
        }
      }
    }

    let updatedPlayers = JSON.parse(JSON.stringify(gameState.players));
    updatedPlayers[playerIndex].pieces[pieceIndex] = updatedPiece;

    const currentGlobal = getGlobalIndex(newPos, piece.color);
    if (newPos >= 0 && newPos < 52) {
      updatedPlayers.forEach((p: Player, pIdx: number) => {
        if (pIdx === playerIndex) return;
        
        p.pieces.forEach((otherPiece: Piece) => {
          if (otherPiece.position < 0 || otherPiece.position >= 52) return;
          
          const otherGlobal = getGlobalIndex(otherPiece.position, otherPiece.color);
          const dist = Math.abs(currentGlobal - otherGlobal);
          const circularDist = Math.min(dist, 52 - dist);
          
          if (circularDist <= updatedPiece.range || otherGlobal === currentGlobal) {
            if (SAFE_ZONES.includes(otherGlobal)) return;

            let damage = updatedPiece.attack;
            if (damage > 0) {
              setAttackingPieceId(piece.id);
              setTimeout(() => setAttackingPieceId(null), 800);

              otherPiece.hp -= damage;
              if (otherPiece.hp <= 0) {
                otherPiece.hp = 1;
                otherPiece.attack = 1;
                otherPiece.range = 0;
                otherPiece.position = -1;
                newLog.push(`💥 ${p.name}'s piece was defeated!`);
              } else {
                newLog.push(`⚔️ ${p.name}'s piece took ${damage} damage. HP: ${otherPiece.hp}`);
              }
            }
          }
        });
      });
    }

    const isPlayerFinished = updatedPlayers[playerIndex].pieces.every((p: Piece) => p.position === 57);
    let newWinners = [...gameState.winners];
    if (isPlayerFinished && !newWinners.includes(player.name)) {
      newWinners.push(player.name);
      newLog.push(`🏆 ${player.name} has finished!`);
    }

    const activePlayersCount = updatedPlayers.filter((p: Player) => !p.pieces.every(pc => pc.position === 57)).length;
    const isGameOver = activePlayersCount <= 1;

    setGameState(prev => {
      const nextPlayerIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
      let finalNextIndex = nextPlayerIndex;
      if (!isGameOver) {
        while (updatedPlayers[finalNextIndex].pieces.every((p: Piece) => p.position === 57)) {
          finalNextIndex = (finalNextIndex + 1) % prev.players.length;
        }
      }

      return {
        ...prev,
        players: updatedPlayers,
        currentPlayerIndex: roll === 6 && !isPlayerFinished ? prev.currentPlayerIndex : finalNextIndex,
        diceValue: 0,
        gameLog: [...newLog, ...prev.gameLog].slice(0, 10),
        winners: newWinners,
        isGameOver: isGameOver
      };
    });
    
    setWaitingForMove(false);
  };

  useEffect(() => {
    if (gameStarted && currentPlayer && (currentPlayer.isBot && !isRolling && !waitingForMove && !gameState.isGameOver)) {
      const timer = setTimeout(rollDice, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameStarted, currentPlayer, isRolling, waitingForMove, gameState.isGameOver, rollDice]);

  useEffect(() => {
    if (gameStarted && currentPlayer && currentPlayer.isBot && waitingForMove && !gameState.isGameOver) {
      const timer = setTimeout(() => {
        const moveablePieces = currentPlayer.pieces.filter(p => {
          if (p.position === -1 && gameState.diceValue === 6) return true;
          if (p.position >= 0 && p.position + gameState.diceValue <= 57) return true;
          return false;
        });
        if (moveablePieces.length > 0) {
          movePiece(moveablePieces[0].id);
        } else {
          setWaitingForMove(false);
          setGameState(prev => {
            let nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
            while (prev.players[nextIndex].pieces.every(p => p.position === 57)) {
              nextIndex = (nextIndex + 1) % prev.players.length;
            }
            return { ...prev, currentPlayerIndex: nextIndex };
          });
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer?.isBot, waitingForMove, gameState.diceValue, gameStarted, gameState.isGameOver, movePiece, currentPlayer?.pieces, gameState.players.length]);

  const getTileCoords = (globalIdx: number, color?: Color, localPos?: number) => {
    if (localPos !== undefined && localPos >= 52 && localPos < 58) {
      const step = localPos - 52;
      if (color === 'red') return [7, 1 + step];
      if (color === 'blue') return [1 + step, 7];
      if (color === 'yellow') return [7, 13 - step];
      if (color === 'green') return [13 - step, 7];
    }
    
    if (globalIdx === -1) return [0, 0];

    const path = [
      [6,1], [6,2], [6,3], [6,4], [6,5], [5,6], [4,6], [3,6], [2,6], [1,6], [0,6], [0,7], [0,8], [1,8], [2,8], [3,8], [4,8], [5,8], [6,9], [6,10], [6,11], [6,12], [6,13], [6,14], [7,14], [8,14], [8,13], [8,12], [8,11], [8,10], [8,9], [9,8], [10,8], [11,8], [12,8], [13,8], [14,8], [14,7], [14,6], [13,6], [12,6], [11,6], [10,6], [9,6], [8,5], [8,4], [8,3], [8,2], [8,1], [8,0], [7,0], [6,0]
    ];
    
    return path[globalIdx % 52] || [7, 7];
  };

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-900 min-h-screen text-white font-sans">
        <h1 className="text-3xl sm:text-5xl font-black mb-6 sm:mb-8 text-yellow-400 uppercase tracking-tighter text-center">Ludo RPG Setup</h1>
        <div className="bg-slate-800 border-2 border-slate-700 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-lg w-full">
          <div className="space-y-4 mb-8">
            {playerConfigs.map((config, index) => (
              <div key={config.color} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border-4 border-white/20 ${config.color === 'red' ? 'bg-red-500' : config.color === 'blue' ? 'bg-blue-500' : config.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                <div className="flex-1">
                  <div className="font-black uppercase text-[10px] sm:text-xs tracking-tighter">{config.color}</div>
                  <div className="flex gap-1 sm:gap-2 mt-1">
                    <button onClick={() => { const n = [...playerConfigs]; n[index].isBot = false; n[index].isActive = true; setPlayerConfigs(n); }} className={`px-2 py-1 rounded-lg text-[8px] sm:text-[10px] font-bold ${!config.isBot && config.isActive ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>HUMAN</button>
                    <button onClick={() => { const n = [...playerConfigs]; n[index].isBot = true; n[index].isActive = true; setPlayerConfigs(n); }} className={`px-2 py-1 rounded-lg text-[8px] sm:text-[10px] font-bold ${config.isBot && config.isActive ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>BOT</button>
                    <button onClick={() => { const n = [...playerConfigs]; n[index].isActive = !n[index].isActive; setPlayerConfigs(n); }} className={`px-2 py-1 rounded-lg text-[8px] sm:text-[10px] font-bold ${!config.isActive ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{config.isActive ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button disabled={playerConfigs.filter(c => c.isActive).length < 2} onClick={() => { const ap = createInitialPlayers(playerConfigs); setGameState(prev => ({ ...prev, players: ap, currentPlayerIndex: 0, isGameOver: false, winners: [], gameLog: [`Game started! ${ap[0].name} turn.`] })); setGameStarted(true); }} className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-slate-700 text-slate-900 font-black rounded-2xl transition-all shadow-xl uppercase tracking-tighter text-xl">Start Game</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 bg-slate-900 min-h-screen text-white font-sans overflow-x-hidden">
      <h1 className="text-2xl sm:text-4xl font-bold mb-4 text-yellow-400 uppercase tracking-tighter">Ludo RPG: Lite</h1>
      <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full max-w-6xl">
        {/* BOARD */}
        <div className="relative w-full max-w-[450px] aspect-square bg-white border-4 sm:border-8 border-slate-700 shadow-2xl rounded-lg overflow-hidden touch-none">
          <div className="grid grid-cols-15 grid-rows-15 w-full h-full text-slate-800" style={{ fontSize: 'min(2vw, 12px)' }}>
            {Array.from({ length: 225 }).map((_, i) => {
              const row = Math.floor(i / 15), col = i % 15;
              let bgColor = 'bg-transparent', content = null;
              if (row < 6 && col < 6) bgColor = 'bg-red-500/20';
              else if (row < 6 && col > 8) bgColor = 'bg-blue-500/20';
              else if (row > 8 && col < 6) bgColor = 'bg-green-500/20';
              else if (row > 8 && col > 8) bgColor = 'bg-yellow-500/20';
              else if (row >= 6 && row <= 8 && col >= 6 && col <= 8) bgColor = 'bg-slate-200';

              const hoveredPiece = hoveredPieceId ? gameState.players.flatMap(p => p.pieces).find(p => p.id === hoveredPieceId) : null;
              
              // Highlight range for current player's pieces when waiting for move
              let rangeHighlightColor: Color | null = null;
              
              let pathIdx = -1;
              for (let g = 0; g < 52; g++) {
                const [tr, tc] = getTileCoords(g);
                if (tr === row && tc === col) { pathIdx = g; break; }
              }

              if (waitingForMove && !currentPlayer.isBot && pathIdx !== -1) {
                currentPlayer.pieces.forEach(p => {
                  if (p.position >= 0 && p.position < 52) {
                    const pGlobal = getGlobalIndex(p.position, p.color);
                    let dist = Math.abs(pGlobal - pathIdx);
                    if (Math.min(dist, 52 - dist) <= p.range) rangeHighlightColor = p.color;
                  }
                });
              }

              if (pathIdx !== -1) {
                bgColor = 'bg-slate-50 border border-slate-200';
                
                if (rangeHighlightColor) {
                  const colorMap = { red: 'bg-red-400/20', blue: 'bg-blue-400/20', yellow: 'bg-yellow-400/20', green: 'bg-green-400/20' };
                  bgColor = `${colorMap[rangeHighlightColor]} animate-pulse`;
                  content = <div className={`w-1.5 h-1.5 rounded-full opacity-40 ${rangeHighlightColor === 'red' ? 'bg-red-500' : rangeHighlightColor === 'blue' ? 'bg-blue-500' : rangeHighlightColor === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`} />;
                }
                
                if (hoveredPiece && hoveredPiece.position >= 0 && hoveredPiece.position < 52) {
                  const dist = Math.abs(getGlobalIndex(hoveredPiece.position, hoveredPiece.color) - pathIdx);
                  if (Math.min(dist, 52 - dist) <= hoveredPiece.range && dist > 0) {
                    const colorMap = { red: 'bg-red-400/40', blue: 'bg-blue-400/40', yellow: 'bg-yellow-400/40', green: 'bg-green-400/40' };
                    bgColor = `${colorMap[hoveredPiece.color]} animate-pulse`;
                    content = <div className={`w-2 h-2 rounded-full opacity-60 ${hoveredPiece.color === 'red' ? 'bg-red-500' : hoveredPiece.color === 'blue' ? 'bg-blue-500' : hoveredPiece.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`} />;
                  }
                }
                const buff = BUFF_LOCATIONS[pathIdx];
                if (buff === 'BUFF_HEAL') content = <span className="text-pink-500">♥</span>;
                else if (buff === 'BUFF_ATTACK') content = <span className="text-orange-500">⚔</span>;
                else if (buff === 'BUFF_RANGE') content = <span className="text-blue-500">🎯</span>;
                if (SAFE_ZONES.includes(pathIdx)) { bgColor = 'bg-slate-200'; content = <span className="text-slate-400 opacity-30">★</span>; }
                return (
                  <div 
                    key={i} 
                    onMouseEnter={() => {
                      const hasPiece = gameState.players.some(player => player.pieces.some(p => getGlobalIndex(p.position, p.color) === pathIdx && p.position < 52 && p.position >= 0));
                      if (hasPiece) setFocusedTile({ globalIdx: pathIdx });
                    }}
                    onMouseLeave={() => setFocusedTile(null)}
                    onMouseDown={() => {
                      const hasPiece = gameState.players.some(player => player.pieces.some(p => getGlobalIndex(p.position, p.color) === pathIdx && p.position < 52 && p.position >= 0));
                      if (hasPiece) setFocusedTile({ globalIdx: pathIdx });
                    }}
                    onMouseUp={() => setFocusedTile(null)}
                    onTouchStart={() => {
                      const hasPiece = gameState.players.some(player => player.pieces.some(p => getGlobalIndex(p.position, p.color) === pathIdx && p.position < 52 && p.position >= 0));
                      if (hasPiece) setFocusedTile({ globalIdx: pathIdx });
                    }}
                    onTouchEnd={() => setFocusedTile(null)}
                    className={`${bgColor} flex items-center justify-center cursor-pointer select-none`}
                  >
                    {content}
                  </div>
                );
              }

              for (const color of ['red', 'blue', 'yellow', 'green'] as Color[]) {
                for (let lp = 52; lp < 58; lp++) {
                  const [tr, tc] = getTileCoords(0, color, lp);
                  if (tr === row && tc === col) {
                    bgColor = color === 'red' ? 'bg-red-100' : color === 'blue' ? 'bg-blue-100' : color === 'yellow' ? 'bg-yellow-100' : 'bg-green-100';
                    return (
                      <div 
                        key={i} 
                        onMouseEnter={() => {
                          const hasPiece = gameState.players.some(player => player.pieces.some(p => p.color === color && p.position === lp));
                          if (hasPiece) setFocusedTile({ globalIdx: 0, color, localPos: lp });
                        }}
                        onMouseLeave={() => setFocusedTile(null)}
                        onMouseDown={() => {
                          const hasPiece = gameState.players.some(player => player.pieces.some(p => p.color === color && p.position === lp));
                          if (hasPiece) setFocusedTile({ globalIdx: 0, color, localPos: lp });
                        }}
                        onMouseUp={() => setFocusedTile(null)}
                        onTouchStart={() => {
                          const hasPiece = gameState.players.some(player => player.pieces.some(p => p.color === color && p.position === lp));
                          if (hasPiece) setFocusedTile({ globalIdx: 0, color, localPos: lp });
                        }}
                        onTouchEnd={() => setFocusedTile(null)}
                        className={`${bgColor} flex items-center justify-center cursor-pointer border border-white/20 select-none`}
                      >
                        {content}
                      </div>
                    );
                  }
                }
              }
              return <div key={i} className={`${bgColor} flex items-center justify-center`}>{content}</div>;
            })}
          </div>

          {/* Home Boxes Pieces */}
          {gameState.players.map((p, pIdx) => (
            <div key={p.color} className={`absolute w-[40%] h-[40%] flex items-center justify-center pointer-events-none ${p.color === 'red' ? 'top-0 left-0' : p.color === 'blue' ? 'top-0 right-0' : p.color === 'green' ? 'bottom-0 left-0' : 'bottom-0 right-0'}`}>
              <div className="grid grid-cols-2 gap-2 pointer-events-auto">
                {p.pieces.filter(pc => pc.position === -1).map(pc => (
                  <div key={pc.id} onClick={() => movePiece(pc.id)} className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 sm:border-4 border-white cursor-pointer shadow-xl flex items-center justify-center text-white font-bold text-xs sm:text-base ${p.color === 'red' ? 'bg-red-600' : p.color === 'blue' ? 'bg-blue-600' : p.color === 'green' ? 'bg-green-600' : 'bg-yellow-500'}`}>P</div>
                ))}
              </div>
            </div>
          ))}

          {/* Active Pieces */}
          {gameState.players.flatMap(player => player.pieces.filter(p => p.position >= 0 && p.position < 58).map(piece => {
            const [row, col] = getTileCoords(getGlobalIndex(piece.position, piece.color), piece.color, piece.position);
            const isCurrentPlayerPiece = currentPlayer.color === piece.color;
            const isAttacking = attackingPieceId === piece.id;
            
            return (
              <div key={piece.id} 
                onMouseEnter={() => { setFocusedTile(piece.position >= 52 ? { globalIdx: 0, color: piece.color, localPos: piece.position } : { globalIdx: getGlobalIndex(piece.position, piece.color) }); }}
                onMouseLeave={() => setFocusedTile(null)}
                onMouseDown={() => { setFocusedTile(piece.position >= 52 ? { globalIdx: 0, color: piece.color, localPos: piece.position } : { globalIdx: getGlobalIndex(piece.position, piece.color) }); }}
                onMouseUp={() => setFocusedTile(null)}
                onTouchStart={() => { setFocusedTile(piece.position >= 52 ? { globalIdx: 0, color: piece.color, localPos: piece.position } : { globalIdx: getGlobalIndex(piece.position, piece.color) }); }}
                onTouchEnd={() => setFocusedTile(null)}
                onClick={() => { if (isCurrentPlayerPiece && waitingForMove) movePiece(piece.id); }}
                className={`absolute w-[5.33%] h-[5.33%] rounded-full border border-white flex items-center justify-center cursor-pointer shadow-md transition-all duration-200 ${isCurrentPlayerPiece && waitingForMove ? 'z-50 scale-125 border-yellow-400 border-2' : 'z-20'} ${piece.color === 'red' ? 'bg-red-500' : piece.color === 'blue' ? 'bg-blue-500' : piece.color === 'yellow' ? 'bg-yellow-500' : piece.color === 'green' ? 'bg-green-500' : 'bg-slate-500'}`}
                style={{ left: `${(col / 15) * 100 + 3.33}%`, top: `${(row / 15) * 100 + 3.33}%`, transform: 'translate(-50%, -50%)' }}>
                <span className="text-[8px] sm:text-[10px] font-black text-white">{piece.hp}</span>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-black/60 px-1 rounded-full text-[6px] sm:text-[8px] font-bold text-yellow-300 flex items-center gap-0.5">
                  ⚔️{piece.attack}
                </div>
                {isAttacking && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-2xl animate-bounce pointer-events-none z-[60]">
                    ⚔️
                    <div className="text-[10px] bg-red-600 text-white px-1 rounded-full font-bold">-{piece.attack}</div>
                  </div>
                )}
              </div>
            );
          }))}
        </div>

        {/* CONTROLS */}
        <div className="flex flex-col gap-4 w-full lg:w-80">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${currentPlayer.color === 'red' ? 'bg-red-500' : currentPlayer.color === 'blue' ? 'bg-blue-500' : currentPlayer.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
              {currentPlayer.name}
            </h2>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 bg-white rounded-xl flex items-center justify-center text-3xl font-black text-slate-800 border-4 border-slate-400 ${isRolling ? 'animate-bounce' : ''}`}>{gameState.diceValue || '?'}</div>
              <button onClick={rollDice} disabled={isRolling || waitingForMove || currentPlayer.isBot} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg text-sm">
                {isRolling ? 'ROLLING...' : waitingForMove ? 'MOVE PIECE' : 'ROLL DICE'}
              </button>
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 h-40 sm:h-60 overflow-hidden flex flex-col shadow-xl">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Battle Log</h3>
            <div className="flex-1 overflow-y-auto text-xs space-y-1 custom-scrollbar">
              {gameState.gameLog.map((log, i) => <div key={i} className={i === 0 ? 'text-yellow-400 font-bold' : 'text-slate-400'}>{log}</div>)}
            </div>
          </div>
        </div>
      </div>

      {/* TILE OVERLAY */}
      {focusedTile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setFocusedTile(null)}>
          <div className="bg-slate-800 border-2 border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter">Details</h3>
              <button onClick={() => setFocusedTile(null)} className="text-slate-400 text-2xl font-bold">&times;</button>
            </div>
            <div className="space-y-3">
              {gameState.players.flatMap(player => player.pieces.filter(p => {
                if (focusedTile.localPos !== undefined) return p.color === focusedTile.color && p.position === focusedTile.localPos;
                return getGlobalIndex(p.position, p.color) === focusedTile.globalIdx && p.position < 52 && p.position >= 0;
              }).map(p => (
                <div key={p.id} onClick={() => { if (gameState.players[gameState.currentPlayerIndex].color === player.color && waitingForMove) { movePiece(p.id); setFocusedTile(null); } }} className="p-3 rounded-xl bg-slate-900 border border-slate-700 flex items-center gap-4 cursor-pointer hover:border-yellow-400">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-lg ${player.color === 'red' ? 'bg-red-500' : player.color === 'blue' ? 'bg-blue-500' : player.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`}>{p.hp}</div>
                  <div className="flex-1 text-xs font-bold text-slate-400">{player.name} <div className="flex gap-2 text-[10px]"><span>⚔ {p.attack}</span> <span>🎯 {p.range}</span></div></div>
                </div>
              )))}
            </div>
            <button onClick={() => setFocusedTile(null)} className="w-full mt-6 py-3 bg-slate-700 text-white font-bold rounded-xl">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
