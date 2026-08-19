import React, { useState } from 'react';
import { Poll, UserProfile } from '../types';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface PollWidgetProps {
  polls: Poll[];
  userProfile: UserProfile | null;
  onVote: (pollId: string, optionId: string) => Promise<void>;
  isLoading?: boolean;
}

const getOptionColor = (index: number) => {
  const colors = [
    '#00e5ff', // Cyan
    '#39ff14', // Lime Green
    '#ff2bd6', // Pink
    '#ffb000', // Gold
    '#bf00ff', // Violet
    '#ff2244', // Red
  ];
  return colors[index % colors.length];
};

export const PollWidget: React.FC<PollWidgetProps> = ({
  polls,
  userProfile,
  onVote,
  isLoading = false,
}) => {
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);

  if (isLoading && polls.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-gray-900/30 border border-gray-800 text-center space-y-2">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin mx-auto" />
        <p className="text-xs text-gray-500 font-medium">Loading polls...</p>
      </div>
    );
  }

  if (!polls || polls.length === 0) {
    return null;
  }

  const handleOptionClick = async (pollId: string, optionId: string) => {
    if (!userProfile) {
      alert('Please log in to vote in community polls!');
      return;
    }

    try {
      setVotingOptionId(optionId);
      await onVote(pollId, optionId);
    } catch (err: any) {
      console.error('Voting error:', err);
    } finally {
      setVotingOptionId(null);
    }
  };

  return (
    <div className="space-y-4">
      {polls.map((poll) => {
        const totalVotes = poll.total_votes || poll.votes?.length || 0;
        const userVote = userProfile
          ? poll.votes?.find((v) => v.user_id === userProfile.id)
          : null;
        const voters = poll.voters || [];

        return (
          <div
            key={poll.id}
            className="p-4 rounded-xl bg-[#0b101a] border border-gray-800/60 shadow-lg"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-[15px] font-semibold text-gray-100 leading-snug">
                {poll.question}
              </h3>
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-gray-800/80 text-[10px] font-medium text-gray-400 border border-gray-700/50">
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
              </span>
            </div>

            {/* Options */}
            <div className="space-y-2">
              {poll.options.map((option, optIdx) => {
                const color = getOptionColor(optIdx);
                const optionVotes = poll.votes?.filter((v) => v.option_id === option.id).length || 0;
                const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
                const isSelected = userVote?.option_id === option.id;
                const isVotingThis = votingOptionId === option.id;

                // Option Voters filter (max 3, newest first)
                const optionVoters = voters.filter((v) => v.option_id === option.id);
                const sortedVoters = [...optionVoters].reverse().slice(0, 3);

                return (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(poll.id, option.id)}
                    disabled={isVotingThis}
                    className={`w-full text-left group transition-colors rounded-lg p-2 -mx-2 flex flex-col gap-1.5 ${
                      isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Text & Meta Row */}
                    <div className="flex items-center justify-between w-full">
                      
                      {/* Left: Radio/Check + Label */}
                      <div className="flex items-center gap-2.5 overflow-hidden pr-3">
                        {isVotingThis ? (
                          <Loader2 className="w-[18px] h-[18px] animate-spin text-gray-500 shrink-0" />
                        ) : isSelected ? (
                          <CheckCircle2
                            className="w-[18px] h-[18px] shrink-0"
                            style={{ color, fill: `${color}20` }} // 20 hex is 12% opacity
                          />
                        ) : (
                          <Circle className="w-[18px] h-[18px] shrink-0 text-gray-600 group-hover:text-gray-500 transition-colors" />
                        )}
                        <span className={`text-[14px] truncate ${isSelected ? 'text-white font-medium' : 'text-gray-300'}`}>
                          {option.option_text}
                        </span>
                      </div>

                      {/* Right: Avatars + Vote Count */}
                      <div className="flex items-center gap-2 shrink-0">
                        {sortedVoters.length > 0 && (
                          <div className="flex -space-x-1.5 items-center">
                            {sortedVoters.map((voter, idx) => (
                              <div
                                key={voter.user_id + idx}
                                className="w-5 h-5 rounded-full overflow-hidden bg-gray-800 ring-2 ring-[#0b101a] flex items-center justify-center shadow-sm"
                                style={{ zIndex: 10 - idx }}
                                title={`@${voter.username}`}
                              >
                                {voter.avatar_url ? (
                                  <img
                                    src={voter.avatar_url}
                                    alt={voter.username}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-[9px] font-bold text-gray-400">
                                    {(voter.username || 'P').charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center text-[13px]">
                          {totalVotes > 0 && (
                            <span className={`font-medium w-8 text-right ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                              {percentage}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar (Full Width under text) */}
                    <div className="h-1.5 w-full bg-gray-900/80 rounded-full relative overflow-hidden">
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: color,
                          boxShadow: `0 0 8px ${color}40`,
                        }}
                      >
                        {/* Subtle bright tip glow */}
                        {percentage > 0 && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-3 rounded-full"
                            style={{
                              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7))',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
