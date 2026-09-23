"use client";

import React, { useEffect, useState } from "react";
import { Video, ExternalLink, Play, BookOpen } from "lucide-react";

interface ResourcePanelProps {
  apiUrl: string;
  topicTag: string | null;
}

export interface ResourceItem {
  topic_tag: string;
  youtube_url: string;
  title: string;
}

export const ResourcePanel: React.FC<ResourcePanelProps> = ({ apiUrl, topicTag }) => {
  const [resource, setResource] = useState<ResourceItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topicTag) return;

    const fetchResource = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const encodedTopic = encodeURIComponent(topicTag);
        const res = await fetch(`${apiUrl}/resources/${encodedTopic}`);
        if (!res.ok) {
          throw new Error(`Failed to load resource for ${topicTag}`);
        }
        const data = await res.json();
        const singleItem: ResourceItem = Array.isArray(data) ? data[0] : data;
        setResource(singleItem);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error fetching resource";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResource();
  }, [apiUrl, topicTag]);

  const getYouTubeId = (url: string) => {
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
    );
    return match ? match[1] : null;
  };

  const videoId = resource?.youtube_url ? getYouTubeId(resource.youtube_url) : null;

  return (
    <div className="axiom-card p-5 space-y-3.5">
      {/* Header Pill + Meta */}
      <div className="flex items-center justify-between">
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#E4F7EC] text-[#2FAE60]">
          Curated resource
        </span>
        <span className="text-[12px] text-[#7C8398]">YouTube tutorial</span>
      </div>

      {isLoading ? (
        <div className="py-8 flex flex-col items-center justify-center space-y-2 text-[#7C8398]">
          <div className="w-6 h-6 rounded-full border-2 border-[#ECEEF5] border-t-[#4B6BFB] animate-spin" />
          <p className="text-xs">Finding recommended tutorial...</p>
        </div>
      ) : resource ? (
        <div className="space-y-3">
          {/* Video Thumbnail */}
          <div className="relative rounded-xl overflow-hidden aspect-video bg-[#F4F6FB] border border-[#ECEEF5] group">
            {videoId ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                  alt={resource.title}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                />
                <a
                  href={resource.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-white/95 text-[#E5484D] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </a>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#7C8398]">
                <Video className="w-8 h-8 text-[#E5484D]" />
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[#16192B] line-clamp-2 leading-snug">
              {resource.title}
            </h4>
            <span className="text-[11px] text-[#7C8398] block mt-1">
              Focus topic: {resource.topic_tag}
            </span>
          </div>

          <a
            href={resource.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-full bg-[#EFF3FF] hover:bg-[#E2EAFF] text-[#4B6BFB] text-xs font-medium transition-colors"
          >
            <span>Watch tutorial</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : (
        <div className="py-6 flex flex-col items-center justify-center text-center space-y-1.5 text-[#7C8398]">
          <BookOpen className="w-6 h-6 stroke-1 text-[#4B6BFB]" />
          <p className="text-xs text-[#16192B] font-medium">No topic selected yet</p>
          <p className="text-[11px] text-[#7C8398] max-w-[200px]">
            Generate your weekly rewind to reveal matching video tutorials.
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-[#E5484D] p-2 rounded-xl bg-[#FCE9E9]">
          {error}
        </p>
      )}
    </div>
  );
};
