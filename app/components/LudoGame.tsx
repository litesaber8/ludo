"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Player, Piece, Color, GameState, BuffType } from '../types/game';
import { createInitialPlayers, getGlobalIndex, BUFF_LOCATIONS, SAFE_ZONES } from '../lib/game-logic';

export default function LudoGame() {
  const [gameState, setGameState] = useState<GameState>({
    players: createInitialPlayers(false, 3),
    currentPlayerIndex: 0,
    diceValue: 0,
    isGameOver: false,
    gameLog: ['Game started! Red player turn.'],
  });
  const [isRolling, setIsRolling] = useState(false);
  const [waitingForMove, setWaitingForMove] = useState(false);

  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  const rollDice = useCallback(() => {
    if (isRolling || waitingForMove) return;
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
      updatedPlayers.forEach((player, pIdx) => {
        if (pIdx === gameState.currentPlayerIndex) return;
        
        player.pieces.forEach((otherPiece) => {
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
    setGameState(prev => ({
      ...prev,
      players: updatedPlayers,
      currentPlayerIndex: roll === 6 ? prev.currentPlayerIndex : (prev.currentPlayerIndex + 1) % 4,
      diceValue: 0,
      gameLog: [...newLog, ...prev.gameLog].slice(0, 10)
    }));
    
    setWaitingForMove(false);
  };

  // Bot Logic
  useEffect(() => {
    if (currentPlayer.isBot && !isRolling && !waitingForMove && !gameState.isGameOver) {
      const timer = setTimeout(rollDice, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer.isBot, isRolling, waitingForMove, gameState.isGameOver, rollDice]);

  useEffect(() => {
    if (currentPlayer.isBot && waitingForMove) {
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
          setGameState(prev => ({
            ...prev,
            currentPlayerIndex: (prev.currentPlayerIndex + 1) % 4
          }));
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

              // Find if this [row, col] matches a path tile
              for (let gIdx = 0; gIdx < 52; gIdx++) {
                const [tr, tc] = getTileCoords(gIdx);
                if (tr === row && tc === col) {
                  bgColor = 'bg-slate-50 border border-slate-200';
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
                  break;
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
          <div className="absolute top-0 left-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players[0].pieces.filter(p => p.position === -1).map(p => (
                <div key={p.id} onClick={() => movePiece(p.id)} className="w-10 h-10 rounded-full bg-red-600 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold">P</div>
              ))}
            </div>
          </div>
          {/* Blue Home */}
          <div className="absolute top-0 right-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players[1].pieces.filter(p => p.position === -1).map(p => (
                <div key={p.id} onClick={() => movePiece(p.id)} className="w-10 h-10 rounded-full bg-blue-600 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold">P</div>
              ))}
            </div>
          </div>
          {/* Green Home */}
          <div className="absolute bottom-0 left-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players[3].pieces.filter(p => p.position === -1).map(p => (
                <div key={p.id} onClick={() => movePiece(p.id)} className="w-10 h-10 rounded-full bg-green-600 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold">P</div>
              ))}
            </div>
          </div>
          {/* Yellow Home */}
          <div className="absolute bottom-0 right-0 w-[180px] h-[180px] flex items-center justify-center pointer-events-none">
            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {gameState.players[2].pieces.filter(p => p.position === -1).map(p => (
                <div key={p.id} onClick={() => movePiece(p.id)} className="w-10 h-10 rounded-full bg-yellow-500 border-4 border-white cursor-pointer hover:scale-110 transition shadow-xl flex items-center justify-center text-white font-bold">P</div>
              ))}
            </div>
          </div>

          {/* Active Pieces Rendering (Overlay) */}
          {gameState.players.map(player => 
            player.pieces.filter(p => p.position >= 0 && p.position < 100).map(piece => {
              const [row, col] = getTileCoords(getGlobalIndex(piece.position, piece.color), piece.color, piece.position);
              const isSelected = selectedPieceId === piece.id;
              
              return (
                <div 
                  key={piece.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    movePiece(piece.id);
                    setSelectedPieceId(piece.id);
                  }}
                  className={`absolute w-[28px] h-[28px] rounded-full border-2 border-white flex flex-col items-center justify-center cursor-pointer shadow-lg transition-all duration-300 hover:scale-110 z-20
                    ${isSelected ? 'ring-4 ring-yellow-400 scale-125 z-30' : ''}
                    ${player.color === 'red' ? 'bg-red-500' : player.color === 'blue' ? 'bg-blue-500' : player.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{
                    left: `${col * 30 + 15}px`,
                    top: `${row * 30 + 15}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="text-[12px] font-black text-white leading-none">{piece.hp}</div>
                  {isSelected && (
                    <div className="absolute -top-10 bg-slate-900 text-white p-1 rounded border border-yellow-400 text-[10px] whitespace-nowrap z-50 shadow-2xl">
                      HP:{piece.hp} ATK:{piece.attack} RNG:{piece.range}
                    </div>
                  )}
                  <div className="flex gap-[1px]">
                    <div className="text-[7px] font-bold text-white/90 leading-none">⚔{piece.attack}</div>
                    <div className="text-[7px] font-bold text-white/90 leading-none">🎯{piece.range}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* CONTROLS & LOGS */}
        <div className="flex flex-col gap-4 w-80">
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
