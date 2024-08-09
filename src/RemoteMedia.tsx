import { LocalP2PRoomMember, LocalStream, RemoteAudioStream, RemoteVideoStream, RoomPublication } from "@skyway-sdk/room"
import React, { useCallback, useEffect, useRef, useState } from "react"

export const RemoteMedia = (props: {
  me: LocalP2PRoomMember,
  publication: RoomPublication<LocalStream>,
  width: string
}) => {
  // TODO
  const [ stream, setStream ] = useState<RemoteVideoStream | RemoteAudioStream>();

  const refVideo = useRef<HTMLVideoElement>(null);
  const refAudio = useRef<HTMLAudioElement>(null);

  // streamにvideo/audioをアタッチする
  useEffect(() => {
    if (stream == null) return;

    if (refVideo.current != null) {
      stream.attach(refVideo.current);
    } else if (refAudio.current != null) {
      stream.attach(refAudio.current);
    }
  }, [stream, refVideo, refAudio]);

  const onSubscribeClick = useCallback(async () => {
    const { stream } = await props.me.subscribe(props.publication.id);
    // video または audio であることを確認
    if (!("track" in stream)) return;

    setStream(stream);

  }, [ props.publication, props.me ]);

  if (stream == null) {
    return (
      <div>
        <button onClick={onSubscribeClick}>
          {props.publication.publisher.id}: {props.publication.contentType}
        </button>
      </div>
    )
  }

  // 映像のとき
  if (stream.contentType === "video") {
    return <video width={props.width} playsInline={true} autoPlay={true} ref={refVideo}/>;
  }

  // 音声のとき
  return <audio controls={true} autoPlay={true} ref={refAudio} />;
}