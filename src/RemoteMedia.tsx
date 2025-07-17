// --- Import Statements ---
import { LocalRoomMember, LocalStream, RemoteAudioStream, RemoteDataStream, RemoteVideoStream, RoomPublication } from "@skyway-sdk/room"
import React, { useCallback, useEffect, useRef, useState } from "react"
import "./RemoteMedia.css"
import { WindowAndAudioAndParticipantsInfo } from "./MainContent"

// --- Interfaces ---
interface RemotemediaProps {
  id: string;
  publication: RoomPublication;
  me: LocalRoomMember;
  remoteDataStream?: RemoteDataStream;  // RemoteDataStreamをオプションで受け取る
}

// --- Global Variables ---
let scrollMyX = window.scrollX;  // 自分自身（参加者側）のスクロール位置（X座標）

export const RemoteMedia: React.FC<RemotemediaProps> = ({
  id,
  publication,
  me,
  remoteDataStream,  // propsに追加
}) => {
  // --- States ---
  // const [ stream, setStream ] = useState<RemoteVideoStream | RemoteAudioStream | RemoteDataStream>();  // リモート側のストリーム
  const [ remoteUserWindowInfo, setRemoteUserWindowInfo ] = useState<WindowAndAudioAndParticipantsInfo | null>(null);  // リモート側のウィンドウ情報

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Effects ---
  useEffect(() => {
    // --- Variables ---
    let videoStream: RemoteVideoStream | undefined;
    let audioStream: RemoteAudioStream | undefined;

    const subscribeStream = async () => {
      if (publication.contentType === "video") {
        const { stream } = await me.subscribe(publication.id);
        if (stream.contentType === "video") {
          videoStream = stream;
          if (videoRef.current) {
            videoStream.attach(videoRef.current);
            await videoRef.current.play();
          }
        }
      } else if (publication.contentType === "audio") {
        const { stream } = await me.subscribe(publication.id);
        if (stream.contentType === "audio") {
          audioStream = stream;
          if (audioRef.current) {
            audioStream.attach(audioRef.current);
            await audioRef.current.play();
          }
        }
      }
    }

    subscribeStream();

    return () => {
      videoStream?.detach();
      audioStream?.detach();
    }

    // if (stream == null || !("track" in stream)) return;

    // if (refVideo.current != null) {
    //   stream.attach(refVideo.current);
    // } else if (refAudio.current != null) {
    //   stream.attach(refAudio.current);
    // }
  }, [publication, me]);  // streamにvideo/audioをアタッチする
  useEffect(() => {
    if (remoteDataStream) {
      const onDataHandler = (args: any) => {
        setRemoteUserWindowInfo( args as WindowAndAudioAndParticipantsInfo );
        // eslint-disable-next-line
        console.log(`リモートユーザ ${publication.publisher.id} からのデータを受信しました！`, args);
      }
      remoteDataStream.onData.add(onDataHandler);
      return () => {
        remoteDataStream.onData.removeAllListeners();
      };
    }
  }, [ remoteDataStream, publication.publisher.id ]);  // remoteDataStreamから，データを受信する

  // --- Style ---
  const remoteUserStyle: React.CSSProperties = {
    position: "absolute",
    top: // 画面の上側にはみ出る場合には，画面上端に位置調整
         0 + window.screen.height / 2 - remoteUserWindowInfo!.height / 2 + remoteUserWindowInfo!.topDiff < 0 ? 0 :
         // 画面の下側にはみ出る場合には，画面下端に位置調整
         0 + window.screen.height / 2 - remoteUserWindowInfo!.height / 2 + remoteUserWindowInfo!.topDiff 
         > 0 + window.screen.height - remoteUserWindowInfo!.height ? 0 + window.screen.height - remoteUserWindowInfo!.height :
         // 画面内に収まるなら，その位置に配置
         0 + window.screen.height / 2 - remoteUserWindowInfo!.height / 2 + remoteUserWindowInfo!.topDiff,
    left: // 画面の左側にはみ出る場合には，画面左端に位置調整
          window.screenLeft + scrollMyX + window.screen.width / 2 - remoteUserWindowInfo!.width / 2 + remoteUserWindowInfo!.leftDiff < 0 ? 0 :
          window.screenLeft + scrollMyX + window.screen.width / 2 - remoteUserWindowInfo!.width / 2 + remoteUserWindowInfo!.leftDiff
          > window.screenLeft + scrollMyX + window.screen.width - remoteUserWindowInfo!.width ? window.screenLeft + scrollMyX + window.screen.width - remoteUserWindowInfo!.width : 
          window.screenLeft + scrollMyX + window.screen.width / 2 - remoteUserWindowInfo!.width / 2 + remoteUserWindowInfo!.leftDiff,
    width: remoteUserWindowInfo?.width !== undefined ? remoteUserWindowInfo.width : 0,
    border: remoteUserWindowInfo?.borderRed !== undefined && remoteUserWindowInfo.borderGreen !== undefined && remoteUserWindowInfo.borderBlue !== undefined &&
            remoteUserWindowInfo?.borderAlpha !== undefined ?
            `10px solid rgba(${remoteUserWindowInfo.borderRed}, ${remoteUserWindowInfo.borderGreen}, ${remoteUserWindowInfo.borderBlue}, ${remoteUserWindowInfo.borderAlpha})` : 
            "10px solid rgba(255, 255, 255, 0)"
  }

  // --- Return ---
  return (
    <div style={remoteUserStyle}>
      <video id={id} playsInline autoPlay ref={videoRef}></video>
      <audio autoPlay playsInline ref={audioRef} />
      {/* デバッグ用にリモートユーザの情報を表示 */}
      {remoteUserWindowInfo && (
        <div style={{position: 'absolute', padding: '5px' }}>
          <p>ID: { publication.publisher.id }</p>
        </div>
      )}
    </div>
  );

  // const onSubscribeClick = useCallback(async () => {
  //   const { stream } = await props.me.subscribe(props.publication.id);
  //   // video または audio であることを確認
  //   // if (!("track" in stream)) return;

  //   setStream(stream);

  // }, [ props.publication, props.me ]);

  // if (stream == null) {
  //   return (
  //     <div>
  //       <button onClick={onSubscribeClick} className={props.publication.contentType+"-button"}>
  //         {props.publication.contentType}データ通信開始（相手側のid：{props.publication.publisher.id}）
  //       </button>
  //     </div>
  //   )
  // }

  // // 映像のとき
  // if (stream.contentType === "video") {
  //   return <video id={props.id} playsInline={true} autoPlay={true} ref={refVideo} style={props.style}/>;
  // }

  // // 音声のとき
  // return <audio id={props.id} className="audio" controls={true} autoPlay={true} ref={refAudio} />;
}