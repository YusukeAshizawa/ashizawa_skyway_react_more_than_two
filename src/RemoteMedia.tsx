import { LocalP2PRoomMember, LocalStream, RemoteAudioStream, RemoteDataStream, RemoteVideoStream, RoomPublication } from "@skyway-sdk/room"
import React, { useCallback, useEffect, useRef, useState } from "react"
import "./RemoteMedia.css"

export const RemoteMedia = (props: {
  me: LocalP2PRoomMember,
  publication: RoomPublication<LocalStream>,
  id: string
  style: React.CSSProperties
}) => {
  const [ stream, setStream ] = useState<RemoteVideoStream | RemoteAudioStream | RemoteDataStream>();

  const refVideo = useRef<HTMLVideoElement>(null);
  const refAudio = useRef<HTMLAudioElement>(null);

  // streamにvideo/audioをアタッチする
  useEffect(() => {
    if (stream == null || !("track" in stream)) return;

    if (refVideo.current != null) {
      stream.attach(refVideo.current);
    } else if (refAudio.current != null) {
      stream.attach(refAudio.current);
    }
  }, [stream, refVideo, refAudio]);

  const onSubscribeClick = useCallback(async () => {
    const { stream } = await props.me.subscribe(props.publication.id);
    // video または audio であることを確認
    // if (!("track" in stream)) return;

    setStream(stream);

  }, [ props.publication, props.me ]);

  if (stream == null) {
    return (
      <div>
        <button onClick={onSubscribeClick} className={props.publication.contentType+"-button"}>
          {props.publication.contentType}データ通信開始（相手側のid：{props.publication.publisher.id}）
        </button>
      </div>
    )
  }

  // 映像のとき
  if (stream.contentType === "video") {
    return <video id={props.id} playsInline={true} autoPlay={true} ref={refVideo} style={props.style}/>;
  }

  // 音声のとき
  return <audio id={props.id} className="audio" controls={true} autoPlay={true} ref={refAudio} />;
}