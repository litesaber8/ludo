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
  const [focusedTile, setFocusedTile] = useState<{ globalIdx: number; color?: Color; localPos?: number } | null>(null);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  const rollDice = useCallback(() => {
    if (isRolling || waitingForMove || gameState.isGameOver) return;
    setIsRolling(true);
    setSelectedPieceId(null);
    
    // Dice roll animation simulation
    setTimeout(() => {
      const newVal = Math.floor(Math.random() * 6) + 1;
      setIsRolling(false);
      setGameState(prev => ({ 
        ...prev, 
        diceValue: newVal,
        gameLog: [`${currentPlayer.name} rolled a ${newVal}`, ...prev.gameLog].slice(0, 10)
      }));

      // Check if any piece can move
      const canMove = currentPlayer.pieces.some(p => {
        if (p.position === -1 && newVal === 6) return true;
        if (p.position >= 0 && p.position + newVal <= 57) return true;
        return false;
      });

      if (!canMove) {
        setGameState(prev => ({
          ...prev,
          gameLog: [`No possible moves for ${currentPlayer.name}`, ...prev.gameLog].slice(0, 10),
          currentPlayerIndex: (prev.currentPlayerIndex + 1) % 4
        }));
      } else {
        setWaitingForMove(true);
      }
    }, 600);
  }, [isRolling, waitingForMove, currentPlayer, gameState.currentPlayerIndex]);

  const movePiece = (pieceId: string) => {
    if (!waitingForMove) return;

    const pieceIndex = currentPlayer.pieces.findIndex(p => p.id === pieceId);
    const piece = currentPlayer.pieces[pieceIndex];
    const roll = gameState.diceValue;

    let newPos = piece.position;
    if (piece.position === -1) {
      if (roll === 6) newPos = 0;
      else return; // Can't move out without 6
    } else {
      if (piece.position + roll > 57) return; // Can't overshoot
      newPos += roll;
    }

    // Apply RPG effects and logic
    const globalIdx = getGlobalIndex(newPos, piece.color);
    let updatedPiece = { ...piece, position: newPos };
    let newLog = [`${currentPlayer.name} moved piece to ${newPos}`];

    setSelectedPieceId(piece.id);

    // Check for BUFFS
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

    // Combat Logic: Check if we landed on someone else's piece
    let updatedPlayers = JSON.parse(JSON.stringify(gameState.players));
    
    // Update current player's piece in the local copy before combat calculation
    // to ensure attack/range buffs are applied if they were just picked up
    updatedPlayers[gameState.currentPlayerIndex].pieces[pieceIndex] = updatedPiece;

    // RANGE ATTACK: check pieces within range
    const currentGlobal = getGlobalIndex(newPos, piece.color);
    if (newPos >= 0 && newPos < 52) {
      updatedPlayers.forEach((player: Player, pIdx: number) => {
        if (pIdx === gameState.currentPlayerIndex) return;
        
        player.pieces.forEach((otherPiece: Piece) => {
          if (otherPiece.position < 0 || otherPiece.position >= 52) return;
          
          const otherGlobal = getGlobalIndex(otherPiece.position, otherPiece.color);
          const dist = Math.abs(currentGlobal - otherGlobal);
          // Simple circular distance for range
          const circularDist = Math.min(dist, 52 - dist);
          
          // Landing exactly on tile (standard combat) OR within range (ranged attack)
          if (circularDist <= updatedPiece.range || otherGlobal === currentGlobal) {
            // Cannot attack in safe zones
            if (SAFE_ZONES.includes(otherGlobal)) return;

            let damage = updatedPiece.attack;

            if (damage > 0) {
              otherPiece.hp -= damage;
              if (otherPiece.hp <= 0) {
                otherPiece.hp = 1;
                otherPiece.attack = 1;
                otherPiece.range = 0;
                otherPiece.position = -1;
                otherPiece.buffs = [];
                newLog.push(`💥 ${player.name}'s piece was defeated by ${updatedPiece.range > 0 && circularDist > 0 ? 'ranged ' : ''}attack!`);
              } else {
                newLog.push(`⚔️ ${player.name}'s piece took ${damage} damage. HP: ${otherPiece.hp}`);
              }
            }
          }
        });
      });
    }

    // Update state
    const isPlayerFinished = updatedPlayers[gameState.currentPlayerIndex].pieces.every((p: Piece) => p.position === 57);
    let newWinners = [...gameState.winners];
    if (isPlayerFinished && !newWinners.includes(currentPlayer.name)) {
      newWinners.push(currentPlayer.name);
      newLog.push(`🏆 ${currentPlayer.name} has finished!`);
    }

    const activePlayers = updatedPlayers.filter((p: Player) => !p.pieces.every(pc => pc.position === 57));
    const isGameOver = activePlayers.length <= 1;

    setGameState(prev => {
      const nextPlayerIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
      // Skip players who have finished
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

  // Bot Logic
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
            return {
              ...prev,
              currentPlayerIndex: nextIndex
            };
          });
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer.isBot, waitingForMove, gameState.diceValue]);

  // Grid coordination map for 15x15 Ludo board
  const getTileCoords = (globalIdx: number, color?: Color, localPos?: number) => {
    // Return [row, col] (0-indexed)
    if (localPos !== undefined && localPos >= 52 && localPos < 58) {
      // Home stretch logic
      const step = localPos - 52;
      if (color === 'red') return [7, 1 + step];
      if (color === 'blue') return [1 + step, 7];
      if (color === 'yellow') return [7, 13 - step];
      if (color === 'green') return [13 - step, 7];
    }
    
    if (globalIdx === -1) return [0, 0]; // Home is handled separately

    // Path coordinates for 52 common tiles (exactly 52 items)
    const path = [
      [6,1], [6,2], [6,3], [6,4], [6,5], // Red start forward (5)
      [5,6], [4,6], [3,6], [2,6], [1,6], [0,6], // Up to Blue start corner (6)
      [0,7], // Top Bridge (1)
      [0,8], [1,8], [2,8], [3,8], [4,8], [5,8], // Blue start forward (6)
      [6,9], [6,10], [6,11], [6,12], [6,13], [6,14], // Right to Yellow start corner (6)
      [7,14], // Right Bridge (1)
      [8,14], [8,13], [8,12], [8,11], [8,10], [8,9], // Yellow start forward (6)
      [9,8], [10,8], [11,8], [12,8], [13,8], [14,8], // Down to Green start corner (6)
      [14,7], // Bottom Bridge (1)
      [14,6], [13,6], [12,6], [11,6], [10,6], [9,6], // Green start forward (6)
      [8,5], [8,4], [8,3], [8,2], [8,1], [8,0], // Left corner (6)
      [7,0], // Left bridge (1)
      [6,0] // Last tile before red home entrance (1)
    ];
    
    return path[globalIdx % 52] || [7, 7];
  };

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900 min-h-screen text-white font-sans">
        <h1 className="text-5xl font-black mb-8 text-yellow-400 uppercase tracking-tighter text-center">Ludo RPG Setup</h1>
        
        <div className="bg-slate-800 border-2 border-slate-700 p-8 rounded-3xl shadow-2xl max-w-lg w-full">
          <h2 className="text-xl font-bold mb-6 text-slate-300 uppercase tracking-widest">Select Players</h2>
          
          <div className="space-y-4 mb-8">
            {playerConfigs.map((config, index) => (
              <div key={config.color} className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
                <div className={`w-12 h-12 rounded-full border-4 border-white/20 ${
                  config.color === 'red' ? 'bg-red-500' : 
                  config.color === 'blue' ? 'bg-blue-500' : 
                  config.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                
                <div className="flex-1">
                  <div className="font-black uppercase text-sm tracking-tighter">{config.color} Player</div>
                  <div className="flex gap-2 mt-1">
                    <button 
                      onClick={() => {
                        const newConfigs = [...playerConfigs];
                        newConfigs[index].isBot = false;
                        newConfigs[index].isActive = true;
                        setPlayerConfigs(newConfigs);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${!config.isBot && config.isActive ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                    >
                      HUMAN
                    </button>
                    <button 
                      onClick={() => {
                        const newConfigs = [...playerConfigs];
                        newConfigs[index].isBot = true;
                        newConfigs[index].isActive = true;
                        setPlayerConfigs(newConfigs);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${config.isBot && config.isActive ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                    >
                      BOT
                    </button>
                    <button 
                      onClick={() => {
                        const newConfigs = [...playerConfigs];
                        newConfigs[index].isActive = !newConfigs[index].isActive;
                        setPlayerConfigs(newConfigs);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${!config.isActive ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                    >
                      {config.isActive ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            disabled={playerConfigs.filter(c => c.isActive).length < 2}
            onClick={() => {
              const activePlayers = createInitialPlayers(playerConfigs);
              setGameState(prev => ({
                ...prev,
                players: activePlayers,
                currentPlayerIndex: 0,
                isGameOver: false,
                winners: [],
                gameLog: [`Game started! ${activePlayers[0].name} turn.`]
              }));
              setGameStarted(true);
            }}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-black rounded-2xl transition-all shadow-xl shadow-yellow-400/20 uppercase tracking-tighter text-xl"
          >
            Start Game
          </button>
          
          <p className="mt-4 text-center text-xs text-slate-500 font-medium">Minimum 2 active players required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-4 bg-slate-900 min-h-screen text-white font-sans">
      <h1 className="text-4xl font-bold mb-6 text-yellow-400 uppercase tracking-tighter">Ludo RPG: Lite</h1>
      
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* GAME BOARD */}
        <div className="relative w-[450px] h-[450px] bg-white border-8 border-slate-700 shadow-2xl rounded-lg overflow-hidden">
          {/* Main Board Grid Representation */}
          <div className="grid grid-cols-15 grid-rows-15 w-full h-full text-slate-800">
            {/* Draw Tiles with Buffs */}
            {Array.from({ length: 225 }).map((_, i) => {
              const row = Math.floor(i / 15);
              const col = i % 15;
              
              // Determine if this tile is part of the common path to show buffs
              let bgColor = 'bg-transparent';
              let content = null;

              // Homes
              if (row < 6 && col < 6) bgColor = 'bg-red-500/20';
              if (row < 6 && col > 8) bgColor = 'bg-blue-500/20';
              if (row > 8 && col < 6) bgColor = 'bg-green-500/20';
              if (row > 8 && col > 8) bgColor = 'bg-yellow-500/20';
              
              // Center
              if (row >= 6 && row <= 8 && col >= 6 && col <= 8) bgColor = 'bg-slate-200';

              const hoveredPiece = hoveredPieceId ? gameState.players.flatMap(p => p.pieces).find(p => p.id === hoveredPieceId) : null;

              for (let gIdx = 0; gIdx < 52; gIdx++) {
                const [tr, tc] = getTileCoords(gIdx);
                if (tr === row && tc === col) {
                  bgColor = 'bg-slate-50 border border-slate-200';
                  
                  // Check if this tile should glow due to range of hovered piece
                  if (hoveredPiece && hoveredPiece.position >= 0 && hoveredPiece.position < 52) {
                    const hoveredGlobal = getGlobalIndex(hoveredPiece.position, hoveredPiece.color);
                    const dist = Math.abs(hoveredGlobal - gIdx);
                    const circularDist = Math.min(dist, 52 - dist);
                    if (circularDist <= hoveredPiece.range && circularDist > 0) {
                      bgColor = 'bg-blue-400/40 border-2 border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.6)] animate-pulse z-10';
                    }
                  }

                  const buff = BUFF_LOCATIONS[gIdx];
                  if (buff) {
                    if (buff === 'BUFF_HEAL') content = <span className="text-pink-500">♥</span>;
                    if (buff === 'BUFF_ATTACK') content = <span className="text-orange-500">⚔</span>;
                    if (buff === 'BUFF_RANGE') content = <span className="text-blue-500">🎯</span>;
                  }
                  if (SAFE_ZONES.includes(gIdx)) {
                    bgColor = 'bg-slate-200 border border-slate-300';
                    content = <span className="text-slate-400 opacity-30 text-lg">★</span>;
                  }
                  return (
                    <div 
                      key={i} 
                      onClick={() => setFocusedTile({ globalIdx: gIdx })}
                      className={`${bgColor} flex items-center justify-center text-[10px] font-bold cursor-pointer hover:bg-slate-200 transition-colors`}
                    >
                      {content}
                    </div>
                  );
                }
              }

              // Check home stretch tiles for clicks too
              for (const color of ['red', 'blue', 'yellow', 'green'] as Color[]) {
                for (let lp = 52; lp < 58; lp++) {
                  const [tr, tc] = getTileCoords(0, color, lp);
                  if (tr === row && tc === col) {
                    bgColor = color === 'red' ? 'bg-red-100' : color === 'blue' ? 'bg-blue-100' : color === 'yellow' ? 'bg-yellow-100' : 'bg-green-100';
                    return (
                      <div 
                        key={i} 
                        onClick={() => setFocusedTile({ globalIdx: 0, color, localPos: lp })}
                        className={`${bgColor} flex items-center justify-center text-[10px] font-bold cursor-pointer hover:opacity-80 transition-opacity border border-white/20`}
                      >
                        {content}
                      </div>
                    );
                  }
                }
              }

              return (
                <div key={i} className={`${bgColor} flex items-center justify-center text-[10px] font-bold`}>
                  {content}
                </div>
              );
            })}
          </div>

          {/* Home Boxes Pieces */}
          {/* Red Home */}
          {gameState.players[0] && (
          <div className="absolute top-0 left-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players[0].pieces.filter(p => p.position === -1).map(p => (
                <div 
                  key={p.id} 
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  onClick={() => movePiece(p.id)} 
                  className="relative w-10 h-10 rounded-full bg-red-600 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold"
                >
                  P
                  {hoveredPieceId === p.id && (
                    <div className="absolute bottom-full mb-2 bg-slate-800 text-white p-2 rounded-lg border border-slate-600 shadow-xl z-[100] min-w-[80px] pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                      <div className="text-[10px] font-bold text-yellow-400 uppercase border-b border-slate-700 pb-1 mb-1">Red Player</div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">HP</span>
                        <span className="text-[10px] font-bold text-pink-400">{p.hp}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">ATK</span>
                        <span className="text-[10px] font-bold text-orange-400">{p.attack}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">RNG</span>
                        <span className="text-[10px] font-bold text-blue-400">{p.range}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}
          {/* Blue Home */}
          {gameState.players.find(p => p.color === 'blue') && (
          <div className="absolute top-0 right-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players.find(p => p.color === 'blue')?.pieces.filter(p => p.position === -1).map(p => (
                <div 
                  key={p.id} 
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  onClick={() => movePiece(p.id)} 
                  className="relative w-10 h-10 rounded-full bg-blue-600 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold"
                >
                  P
                  {hoveredPieceId === p.id && (
                    <div className="absolute bottom-full mb-2 bg-slate-800 text-white p-2 rounded-lg border border-slate-600 shadow-xl z-[100] min-w-[80px] pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                      <div className="text-[10px] font-bold text-yellow-400 uppercase border-b border-slate-700 pb-1 mb-1">Blue Player</div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">HP</span>
                        <span className="text-[10px] font-bold text-pink-400">{p.hp}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">ATK</span>
                        <span className="text-[10px] font-bold text-orange-400">{p.attack}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">RNG</span>
                        <span className="text-[10px] font-bold text-blue-400">{p.range}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}
          {/* Green Home */}
          {gameState.players.find(p => p.color === 'green') && (
          <div className="absolute bottom-0 left-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players.find(p => p.color === 'green')?.pieces.filter(p => p.position === -1).map(p => (
                <div 
                  key={p.id} 
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  onClick={() => movePiece(p.id)} 
                  className="relative w-10 h-10 rounded-full bg-green-600 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold"
                >
                  P
                  {hoveredPieceId === p.id && (
                    <div className="absolute bottom-full mb-2 bg-slate-800 text-white p-2 rounded-lg border border-slate-600 shadow-xl z-[100] min-w-[80px] pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                      <div className="text-[10px] font-bold text-yellow-400 uppercase border-b border-slate-700 pb-1 mb-1">Green Player</div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">HP</span>
                        <span className="text-[10px] font-bold text-pink-400">{p.hp}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">ATK</span>
                        <span className="text-[10px] font-bold text-orange-400">{p.attack}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">RNG</span>
                        <span className="text-[10px] font-bold text-blue-400">{p.range}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}
          {/* Yellow Home */}
          {gameState.players.find(p => p.color === 'yellow') && (
          <div className="absolute bottom-0 right-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players.find(p => p.color === 'yellow')?.pieces.filter(p => p.position === -1).map(p => (
                <div 
                  key={p.id} 
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  onClick={() => movePiece(p.id)} 
                  className="relative w-10 h-10 rounded-full bg-yellow-500 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold"
                >
                  P
                  {hoveredPieceId === p.id && (
                    <div className="absolute bottom-full mb-2 bg-slate-800 text-white p-2 rounded-lg border border-slate-600 shadow-xl z-[100] min-w-[80px] pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                      <div className="text-[10px] font-bold text-yellow-400 uppercase border-b border-slate-700 pb-1 mb-1">Yellow Player</div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">HP</span>
                        <span className="text-[10px] font-bold text-pink-400">{p.hp}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">ATK</span>
                        <span className="text-[10px] font-bold text-orange-400">{p.attack}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[8px] text-slate-400">RNG</span>
                        <span className="text-[10px] font-bold text-blue-400">{p.range}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Active Pieces Rendering (Overlay) */}
          {(() => {
            const allPiecesInTiles: { [key: string]: { piece: Piece; player: Player }[] } = {};
            gameState.players.forEach(player => {
              player.pieces.forEach(p => {
                if (p.position >= 0 && p.position < 58) {
                  const gIdx = getGlobalIndex(p.position, p.color);
                  const key = p.position >= 52 ? `home-${p.color}-${p.position}` : `global-${gIdx}`;
                  if (!allPiecesInTiles[key]) allPiecesInTiles[key] = [];
                  allPiecesInTiles[key].push({ piece: p, player });
                }
              });
            });

            return Object.entries(allPiecesInTiles).flatMap(([key, items]) => {
              return items.map((item, index) => {
                const { piece, player } = item;
                const pos = piece.position;
                const gIdx = getGlobalIndex(pos, piece.color);
                const [row, col] = getTileCoords(gIdx, piece.color, pos);
                const isSelected = selectedPieceId === piece.id;
                const isHovered = hoveredPieceId === piece.id;
                const isMyTurn = gameState.currentPlayerIndex === gameState.players.findIndex(pl => pl.color === piece.color);
                const count = items.length;
                let offsetX = 0;
                let offsetY = 0;
                
                // Centered but small offset if multiple
                if (count > 1) {
                  const angle = (index / count) * 2 * Math.PI;
                  const radius = 6;
                  offsetX = Math.cos(angle) * radius; 
                  offsetY = Math.sin(angle) * radius;
                }

                return (
                  <div
                    key={piece.id}
                    onMouseEnter={() => setHoveredPieceId(piece.id)}
                    onMouseLeave={() => setHoveredPieceId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      const tileData = pos >= 52 ? { globalIdx: 0, color: piece.color, localPos: pos } : { globalIdx: gIdx };
                      setFocusedTile(tileData);
                      if (isMyTurn) {
                        if (waitingForMove) {
                           movePiece(piece.id);
                        }
                        setSelectedPieceId(piece.id);
                      }
                    }}
                    className={`absolute w-[24px] h-[24px] rounded-full border border-white flex flex-col items-center justify-center cursor-pointer shadow-md transition-all duration-200 hover:scale-125
                    ${isSelected ? 'ring-2 ring-yellow-400 scale-125' : ''}
                    ${isHovered ? 'scale-125 z-50' : ''}
                    ${player.color === 'red' ? 'bg-red-500' : player.color === 'blue' ? 'bg-blue-500' : player.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{
                      left: `${col * 30 + 15 + offsetX}px`,
                      top: `${row * 30 + 15 + offsetY}px`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: (isMyTurn ? 50 : 20) + index + (isSelected || isHovered ? 30 : 0),
                      boxShadow: isHovered || piece.hp > 1 ? `0 0 0 ${Math.min(piece.hp * 2, 8)}px rgba(255,255,255,0.2), 0 0 ${10 + piece.hp * 5}px rgba(255,255,255,${0.2 + 0.1 * piece.hp})` : 'none',
                      filter: isHovered ? 'brightness(1.2) contrast(1.1)' : 'none'
                    }}
                  >
                    <div className="text-[10px] font-black text-white leading-none">{piece.hp}</div>
                    
                    {/* Stats Popup on Hover */}
                    {isHovered && (
                      <div className="absolute bottom-full mb-2 bg-slate-800 text-white p-2 rounded-lg border border-slate-600 shadow-xl z-[100] min-w-[80px] pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                        <div className="text-[10px] font-bold text-yellow-400 uppercase border-b border-slate-700 pb-1 mb-1">{player.name}</div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-[8px] text-slate-400">HP</span>
                          <span className="text-[10px] font-bold text-pink-400">{piece.hp}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-[8px] text-slate-400">ATK</span>
                          <span className="text-[10px] font-bold text-orange-400">{piece.attack}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-[8px] text-slate-400">RNG</span>
                          <span className="text-[10px] font-bold text-blue-400">{piece.range}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-[1px]">
                      <div className="text-[6px] font-bold text-white/90 leading-none">{piece.attack}</div>
                      <div className="text-[6px] font-bold text-white/90 leading-none">{piece.range}</div>
                    </div>
                  </div>
                );
              });
            });
          })()}
        </div>

        {/* Tile Focused / Expanded View Overlay */}
        {focusedTile && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setFocusedTile(null)}>
            <div className="bg-slate-800 border-2 border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-white uppercase tracking-tighter">
                  Tile Details {focusedTile.localPos !== undefined ? `(Home Stretch ${focusedTile.localPos})` : `(Global ${focusedTile.globalIdx})`}
                </h3>
                <button onClick={() => setFocusedTile(null)} className="text-slate-400 hover:text-white text-2xl font-bold">&times;</button>
              </div>
              
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {(() => {
                  const piecesInTile = gameState.players.flatMap(player => 
                    player.pieces.filter(p => {
                      if (focusedTile.localPos !== undefined) {
                        return p.color === focusedTile.color && p.position === focusedTile.localPos;
                      }
                      return getGlobalIndex(p.position, p.color) === focusedTile.globalIdx && p.position < 52 && p.position >= 0;
                    }).map(p => ({ piece: p, player }))
                  );

                  if (piecesInTile.length === 0) return <div className="text-center py-8 text-slate-500 italic">No pieces here</div>;

                  return piecesInTile.map(({ piece, player }) => {
                    const isMyPiece = gameState.players[gameState.currentPlayerIndex].color === player.color;
                    const canBeMoved = isMyPiece && waitingForMove;
                    
                    // Possible new positions based on current dice roll
                    let canPieceActuallyMove = false;
                    if (canBeMoved) {
                       const roll = gameState.diceValue;
                       if (piece.position === -1) {
                         if (roll === 6) canPieceActuallyMove = true;
                       } else {
                         if (piece.position + roll <= 57) canPieceActuallyMove = true;
                       }
                    }

                    return (
                      <div 
                        key={piece.id}
                        onClick={() => {
                          setSelectedPieceId(piece.id);
                          if (canPieceActuallyMove) {
                            movePiece(piece.id);
                            setFocusedTile(null);
                          }
                        }}
                        className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-4
                          ${selectedPieceId === piece.id ? 'border-yellow-400 bg-yellow-400/10' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500'}
                          ${!canPieceActuallyMove && canBeMoved ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <div className={`w-12 h-12 rounded-full border-2 border-white flex flex-col items-center justify-center shadow-lg
                          ${player.color === 'red' ? 'bg-red-500' : player.color === 'blue' ? 'bg-blue-500' : player.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`}>
                          <span className="text-white font-black text-xl">{piece.hp}</span>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-black text-slate-400 uppercase tracking-widest">{player.name}</div>
                          <div className="flex gap-4 mt-1">
                            <div className="flex items-center gap-1">
                              <span className="text-orange-500">⚔</span>
                              <span className="font-bold text-white">{piece.attack}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-blue-500">🎯</span>
                              <span className="font-bold text-white">{piece.range}</span>
                            </div>
                          </div>
                        </div>
                        {canPieceActuallyMove && (
                          <div className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-[10px] font-black animate-pulse">
                            MOVE
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              
              <button 
                onClick={() => setFocusedTile(null)}
                className="w-full mt-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* CONTROLS & LOGS */}
        <div className="flex flex-col gap-4 w-80">
          {/* Winner Board */}
          {gameState.winners.length > 0 && (
            <div className="bg-slate-800 p-4 rounded-xl border-2 border-green-500 shadow-xl">
              <h3 className="text-xs font-black text-green-500 uppercase tracking-widest mb-2">Winners Board</h3>
              <div className="space-y-1">
                {gameState.winners.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                    <span className="font-bold">{name}</span>
                  </div>
                ))}
              </div>
              {gameState.isGameOver && (
                <div className="mt-4 flex flex-col gap-2">
                  <div className="text-center text-xl font-black text-yellow-400 animate-bounce">
                    GAME OVER!
                  </div>
                  <button 
                    onClick={() => setGameStarted(false)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all"
                  >
                    Play Again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Piece Stats Detail */}
          {selectedPieceId ? (
            <div className="bg-slate-800 p-4 rounded-xl border-2 border-yellow-400 shadow-xl animate-pulse">
               <h3 className="text-xs font-black text-yellow-400 uppercase tracking-widest mb-2">Selected Piece Stats</h3>
               {gameState.players.flatMap(p => p.pieces).filter(p => p.id === selectedPieceId).map(p => (
                 <div key={p.id} className="flex justify-around items-center">
                    <div className="flex flex-col items-center">
                      <span className="text-xl">❤️</span>
                      <span className="text-lg font-bold">{p.hp}</span>
                      <span className="text-[10px] text-slate-400">HEALTH</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl">⚔️</span>
                      <span className="text-lg font-bold">{p.attack}</span>
                      <span className="text-[10px] text-slate-400">ATTACK</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl">🎯</span>
                      <span className="text-lg font-bold">{p.range}</span>
                      <span className="text-[10px] text-slate-400">RANGE</span>
                    </div>
                 </div>
               ))}
            </div>
          ) : (
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl opacity-50 italic text-sm text-center">
              Select a piece to see detailed stats
            </div>
          )}

          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 uppercase tracking-tight">
              <span className={`w-4 h-4 rounded-full ${currentPlayer.color === 'red' ? 'bg-red-500' : currentPlayer.color === 'blue' ? 'bg-blue-500' : currentPlayer.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
              {currentPlayer.name}
            </h2>
            
            <div className="flex flex-col items-center gap-4 py-2">
              <div className={`w-20 h-20 bg-white rounded-2xl shadow-inner flex items-center justify-center text-5xl font-black text-slate-800 border-4 border-slate-400 
                ${isRolling ? 'animate-bounce' : ''}`}>
                {gameState.diceValue || '?'}
              </div>
              
              <button 
                onClick={rollDice}
                disabled={isRolling || waitingForMove || currentPlayer.isBot}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg active:scale-95"
              >
                {isRolling ? 'ROLLING...' : waitingForMove ? 'MOVE PIECE' : 'ROLL DICE'}
              </button>
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 h-64 overflow-hidden flex flex-col shadow-xl">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Battle Log</h3>
            <div className="flex-1 overflow-y-auto text-sm space-y-1 pr-2 custom-scrollbar">
              {gameState.gameLog.map((log, i) => (
                <div key={i} className={`${i === 0 ? 'text-yellow-400 font-bold' : 'text-slate-400'}`}>
                   {log}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Legend</h3>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-center gap-2"><span className="text-pink-500 font-bold">♥</span> HEAL: HP +1</div>
              <div className="flex items-center gap-2"><span className="text-blue-500 font-bold">🎯</span> RANGE: Attack from distance</div>
              <div className="flex items-center gap-2"><span className="text-orange-500 font-bold">⚔</span> ATK: Increase Damage by 1</div>
              <div className="flex items-center gap-2"><span className="text-slate-400 font-bold">★</span> SAFE: No attacks allowed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
