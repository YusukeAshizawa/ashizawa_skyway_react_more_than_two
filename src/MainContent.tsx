import { LocalAudioStream, LocalP2PRoomMember, LocalStream, LocalVideoStream, nowInSec, RoomPublication, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from "@skyway-sdk/room";
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RemoteMedia } from "./RemoteMedia";

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

  // tokenとvideo要素の参照ができたら実行
  useEffect(() => {
    const initialize = async () => {
      if (token == null || localVideo.current == null) return;

      const stream = 
        await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
      stream.video.attach(localVideo.current);

      await localVideo.current.play();
      setLocalStream(stream);
    };

    initialize();
  }, [token, localVideo]);

  // ルーム名
  const [ roomName, setRoomName ] = useState("");
  // 自分自身の参加者情報
  const [ me, setMe ] = useState<LocalP2PRoomMember>();

  const canJoin = useMemo(() => {
    return roomName !== "" && localStream != null && me == null;
  }, [roomName, localStream, me]);

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

    const dataStream = await SkyWayStreamFactory.createDataStream();

    // 映像と音声を配信
    await me.publish(localStream.video);
    await me.publish(localStream.audio);
    await me.publish(dataStream);

    // （以下，データ送信方法）
    // // 任意のデータ
    // const data = { message: "こんにちは" };
    // // データ送信
    // dataStream.write(data);



    // 自分以外の参加者情報を取得
    setOtherUserPublications(room.publications.filter(p => p.publisher.id !== me.id));

    // その後に参加してきた人の情報を取得
    room.onStreamPublished.add((e) => {
      if (e.publication.publisher.id !== me.id) {
        setOtherUserPublications(pre => [ ...pre, e.publication ]);
      }
    });

    // データ受信
    // room.onStreamPublished.add(async (e) => {
    //   // DataStreamを購読
    //   if (e.publication.stream?.contentType === "data") {
    //     const { stream } = await me.subscribe(e.publication.id);
    //     // ここは必ずRemoteDataStreamになるはず
    //     if (stream.contentType === "data") {
    //       // データ受信時のcallbackを登録
    //       const { removeListener } = stream.onData.add(data => {
    //         // 受信データ
    //         const receivedData = data as {message: string};
    //       });

    //       // 購読解除する時
    //       removeListener();
    //     }
    //   }
    // })

  }, [roomName, token, localStream]);

  const [ otherUserPublications, setOtherUserPublications ] = useState<RoomPublication<LocalStream>[]>([]);
  
  return (
    <div>
      <p>ID: {me?.id ?? ""} </p>
      <div>
        room name: <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
        <button onClick={onJoinClick} disabled={!canJoin}>join</button>
      </div>
      <video ref={localVideo} width="400px" muted playsInline></video>
      <div>
        {
          me != null && otherUserPublications.map(p => (
            <RemoteMedia key={p.id} me={me} publication={p} />
          ))
        }  
      </div>
    </div>
  )
}