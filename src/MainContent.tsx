import { LocalAudioStream, LocalDataStream, LocalP2PRoomMember, LocalStream, LocalVideoStream, nowInSec, RemoteDataStream, RoomPublication, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from "@skyway-sdk/room";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RemoteMedia } from "./RemoteMedia";
import "./MainContent.css"

interface WindowPosition {
    top: number;
    left: number;
}

export const MainContent = () => {
  const appId = useMemo(() => process.env.REACT_APP_SKYWAY_APP_ID, []);
  const secretKey = useMemo(() => process.env.REACT_APP_SKYWAY_SECRET_KEY, []);

  const token = useMemo(() => {
    if (appId == null || secretKey == null) return undefined;

    return new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      scope: {
        app: {
          id: appId,
          turn: true,
          actions: ["read"],
          channels: [
            {
              id: "*",
              name: "*",
              actions: ["write"],
              members: [
                {
                  id: "*",
                  name: "*",
                  actions: ["write"],
                  publication: {
                    actions: ["write"],
                  },
                  subscription: {
                    actions: ["write"],
                  },
                },
              ],
              sfuBots: [
                {
                  actions: ["write"],
                  forwardings: [
                    {
                      actions: ["write"],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }).encode(secretKey);
  }, [appId, secretKey]);

  const localVideo = useRef<HTMLVideoElement>(null);

  // ローカルストリームをここに保持する
  const [localStream, setLocalStream] = useState<{
    audio: LocalAudioStream;
    video: LocalVideoStream;
  }>();
  const [ localDataStream, setLocalDataStream ] = useState<LocalDataStream>();
  // console.log(localDataStream);
  // me.subscribe(publication.id) の戻り値に含まれる stream
  // (contentType === "data" のもの)
  const [ otherUserDataStream, setOtherUserDataStream ] = useState<RemoteDataStream>();
  console.log(otherUserDataStream);

  // tokenとvideo要素の参照ができたら実行
  useEffect(() => {
    // ビデオの初期設定
    const initialize = async () => {
      if (token == null || localVideo.current == null) return;

      const stream = 
        await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
      stream.video.attach(localVideo.current);

      const dataStream = await SkyWayStreamFactory.createDataStream();

      await localVideo.current.play();
      setLocalStream(stream);
      setLocalDataStream(dataStream);
    };

    initialize();
    console.log("初期化がされました！");
  }, [token, localVideo]);

  // 自分自身のウィンドウの位置・大きさの調整
  const [ myWindowPosition, setMyWindowPosition ] = useState<WindowPosition>({ top: 0, left: 0 });

  const myWindowContainerStyle = useMemo<React.CSSProperties>(() => ({
      top: myWindowPosition.top,
      left: myWindowPosition.left
  }), [ myWindowPosition ]);

  // myWindowPositionが更新された時の処理
  useEffect(() => {
    console.log("自分のデータ送信中...");
    if (localDataStream != null) {
      localDataStream.write(myWindowPosition);
      console.log("自分のデータを送信しました！");
    }
  }, [ myWindowPosition ]);

  // これを field-area の div の onKeyDown に指定
  const onKeyDown = useCallback((e:React.KeyboardEvent<HTMLDivElement>) => {
    let h = 0;
    let v = 0;
    
    // 移動量は適当に決める
    if (e.key === "Left" || e.key === "ArrowLeft") {
        h = -8;
    } else if (e.key === "Up" || e.key === "ArrowUp") {
        v = -8;
    } else if (e.key === "Right" || e.key === "ArrowRight") {
        h = 8;
    } else if (e.key === "Down" || e.key === "ArrowDown") {
        v = 8;
    } else {
        return;
    }

    // myWindowPositionに反映
    setMyWindowPosition(pre => {
        const newPosition: WindowPosition = {
            ...pre,
            top: pre.top + v,
            left: pre.left + h
        };

        // 実際には、フィールド領域をはみ出ないように調整を入れる（省略）

        return newPosition;
    });
  }, []);

  // 他ユーザの座標情報を保持
  // （これを自分のアイコンと同様に画面表示用のstyleに反映する）
  const [ otherUserWindowPosition, setOtherUserWindowPosition ] = useState<WindowPosition>({ top:0, left:0 });

  // 他ユーザのウィンドウの位置・大きさの変更
  const otherUserWindowContainerStyle = useMemo<React.CSSProperties>(() => ({
    top: otherUserWindowPosition.top,
    left: otherUserWindowPosition.left
  }), [ otherUserWindowPosition ]);

  useEffect(() => {
    console.log("相手のデータ受信設定");
    if (otherUserDataStream != null) {
      // callbackで受信座標を反映する
      otherUserDataStream.onData.add((args) => {
        setOtherUserWindowPosition(args as WindowPosition)
        console.log("相手のデータを受信しました！");
      });
    }
  }, [ otherUserDataStream ]);

  // ルーム名
  const [ roomName, setRoomName ] = useState("");
  // 自分自身の参加者情報
  const [ me, setMe ] = useState<LocalP2PRoomMember>();

  // ルームに入ることができるかの確認
  const canJoin = useMemo(() => {
    return roomName !== "" && localStream != null && me == null;
  }, [roomName, localStream, me]);

  // Joinボタンをクリックした時に実行する関数
  const onJoinClick = useCallback(async () => {
    // canJoinまでにチェックされるので，普通は起きない
    // assertionメソッドにしてもいい
    if (localStream == null || token == null) return;

    const context = await SkyWayContext.Create(token);

    // ルームを取得、または新規作成
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: 'p2p',
      name: roomName,
    });

    const me = await room.join();
    setMe(me);

    // 映像と音声を配信
    await me.publish(localStream.video);
    await me.publish(localStream.audio);
    if (localDataStream !== undefined) {
      console.log("published data stream");
      await me.publish(localDataStream);
    }

    // 自分以外の参加者情報を取得
    const otherPublifications = room.publications.filter(p => p.publisher.id !== me.id);
    setOtherUserPublications(otherPublifications);
    console.log(otherPublifications);
    for (let i = 0; i < otherPublifications.length; i++) {
      if (otherPublifications[i].contentType === "data") {
        const { stream } = await me.subscribe(otherPublifications[i].id);
        if (stream.contentType === "data") {
          setOtherUserDataStream(stream);
        }
      }
    }

    // その後に参加してきた人の情報を取得
    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id !== me.id) {
        setOtherUserPublications(pre => [ ...pre, e.publication ]);
      }

      console.log(e);
      if (e.publication.contentType === "data") {
        console.log("DataStreamを購読しました！");
        const { stream } = await me.subscribe(e.publication.id);
        // ここは必ずRemoteDataStreamになるはず
        if (stream.contentType === "data") {
          console.log("!!!!!!!!!", stream);
          setOtherUserDataStream(stream);
          // データ受信時のcallbackを登録
          // const { removeListener } = stream.onData.add((data) => setOtherUserWindowPosition(data as WindowPosition));
    
          // 購読解除する時
          // removeListener();
        }
      }
    });

  }, [roomName, token, localStream, localDataStream]);

  const [ otherUserPublications, setOtherUserPublications ] = useState<RoomPublication<LocalStream>[]>([]);
  
  return (
    <div>
      <p>ID: {me?.id ?? ""} </p>
      <div>
        room name: <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
        <button onClick={onJoinClick} disabled={!canJoin}>join</button>
      </div>
      <div className="field-area" tabIndex={-1} onKeyDown={ onKeyDown }>
        <div className="icon-container" style={myWindowContainerStyle}>
          <video className="video" ref={localVideo} width="200px" muted playsInline></video>
        </div>
        <div className="icon-container" style={otherUserWindowContainerStyle}>
        {
          me != null && otherUserPublications.map(p => (
            <RemoteMedia width="200px" key={p.id} me={me} publication={p}/>
          ))
        }  
        </div>
      </div>
    </div>
  )
}