import { LocalAudioStream, LocalDataStream, LocalP2PRoomMember, LocalStream, LocalVideoStream, nowInSec, RemoteDataStream, RoomPublication, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from "@skyway-sdk/room";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RemoteMedia } from "./RemoteMedia";
import "./MainContent.css"
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera } from "@mediapipe/camera_utils";
import Webcam from "react-webcam";

interface WindowInfo {
    top: number;
    left: number;
    width: number;
}

// 数値型リストの要素の平均値を求める関数
function Average(number_list: number[]) {
  let sum = 0;  // 引数のリスト内の要素の合計値
  number_list.forEach((number) => {
    sum += number;
  })
  return sum / number_list.length;
}

// 2つのベクトル（数値型リスト）の内積を求める関数
function Inner(number_list1: number[], number_list2: number[]) {
  return number_list1[0] * number_list2[0] + number_list1[1] * number_list2[1];
}

// ベクトル（数値型リスト）の長さを求める関数
function Norm(number_list: number[]) {
  return Math.sqrt(number_list[0] * number_list[0] + number_list[1] * number_list[1]);
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
  // console.log(otherUserDataStream);

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
    // console.log("初期化がされました！");
  }, [token, localVideo]);

  // 自分自身のウィンドウの位置・大きさの調整
  const [ myWindowInfo, setMyWindowInfo ] = useState<WindowInfo>({ top: 0, left: 0, width: 200 });

  const myWindowContainerStyle = useMemo<React.CSSProperties>(() => ({
      position: "absolute",
      top: myWindowInfo.top,
      left: myWindowInfo.left,
      width: myWindowInfo.width
  }), [ myWindowInfo ]);

  // myWindowPositionが更新された時の処理
  useEffect(() => {
    // console.log("自分のデータ送信中...");
    if (localDataStream != null) {
      localDataStream.write(myWindowInfo);
      // console.log("自分のデータを送信しました！");
    }
  }, [ myWindowInfo ]);

  // MediaPipeを用いて，対話相手の頭部方向を取得
  const webcamRef = useRef<Webcam>(null);
  const resultsRef = useRef<Results>();

  /** 検出結果（フレーム毎に呼び出される） */
  const onResults = useCallback((results: Results) => {
    // 検出結果の格納
    resultsRef.current = results;

    // 頭部方向の取得
    let landmarks_pos_x = []  // 468個の点のx座標を格納するリスト
    let landmarks_pos_y = []  // 468個の点のy座標を格納するリスト
    let face_center_default_pos = []  // 正面を向いた時の顔の中心点（ここでは，飯塚さんの修論に倣って，鼻の先の座標としている．）
    if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
      for (let id = 0; id < results.multiFaceLandmarks[0].length; id++) {
        // 特定の顔の点を取得（x座標）
        if (results.multiFaceLandmarks[0][id].x < 0) landmarks_pos_x.push(0);
        else if (results.multiFaceLandmarks[0][id].x > 1) landmarks_pos_x.push(1);
        else landmarks_pos_x.push(results.multiFaceLandmarks[0][id].x);

        // 特定の顔の点を取得（y座標）
        if (results.multiFaceLandmarks[0][id].y < 0) landmarks_pos_y.push(0);
        else if (results.multiFaceLandmarks[0][id].y > 1) landmarks_pos_y.push(1);
        else landmarks_pos_y.push(results.multiFaceLandmarks[0][id].y);

        // 正面を向いた時の顔の中心点を取得（x，y座標）
        if (id === 1) {
          // x座標
          if (results.multiFaceLandmarks[0][id].x < 0) face_center_default_pos.push(0);
          else if (results.multiFaceLandmarks[0][id].x > 1) face_center_default_pos.push(1);
          else face_center_default_pos.push(results.multiFaceLandmarks[0][id].x);

          // y座標
          if (results.multiFaceLandmarks[0][id].y < 0) face_center_default_pos.push(0);
          else if (results.multiFaceLandmarks[0][id].y > 1) face_center_default_pos.push(1);
          else face_center_default_pos.push(results.multiFaceLandmarks[0][id].y);
        }
      }
    }
    // 顔の中心点の座標
    const face_center_pos = [Average(landmarks_pos_x), Average(landmarks_pos_y)];
    // 頭部方向を計算するためのベクトル
    const base_vector = [1,0];  
    // 顔の中心点を原点とした時の，正面を向いた際の顔の中心点の座標
    const fc_d_from_fc_vector = [face_center_default_pos[0] - face_center_pos[0], face_center_default_pos[1] - face_center_pos[1]];
    // console.log("face_center_pos = " + face_center_default_pos);
    // console.log("face_center_default_pos = " + face_center_default_pos);
    // console.log("fc_d_from_fc_vector = " + fc_d_from_fc_vector);

    // 頭部方向（ラジアン）
    let rad_head_direction = Math.acos(Inner(base_vector, fc_d_from_fc_vector) / (Norm(base_vector) * Norm(fc_d_from_fc_vector)));
    // 頭部方向（度）
    let theta_head_direction = rad_head_direction * (180 / Math.PI);
    // arccosの値域が0～πであるため，上下の区別をするために，上を向いている時には，ラジアンおよび度の値を更新する
    if (fc_d_from_fc_vector[1] < 0) {
      rad_head_direction = -rad_head_direction;
      theta_head_direction = Math.PI * 2 - theta_head_direction;
    }
    console.log("theta_head_direction = " + theta_head_direction);
  },[]);

  useEffect(() => {
    const faceMesh = new FaceMesh({
      locateFile: file => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      }
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // landmarks 468 -> 478
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    if (webcamRef.current) {
      const camera = new Camera(webcamRef.current.video!, {
        onFrame: async () => {
          await faceMesh.send({ image: webcamRef.current!.video! })
        }
      });
      camera.start();
    }

    return () => {
        faceMesh.close();
    }
  }, [onResults]);

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

    // myWindowInfoに反映
    // ウィンドウの位置・大きさを変更
    setMyWindowInfo(pre => {
        const newInfo: WindowInfo = {
            top: pre.top + v,
            left: pre.left + h,
            width: pre.width + v
        };

        // TODO: 実際には、フィールド領域をはみ出ないように調整を入れる（省略）

        return newInfo;
    });
  }, []);

  // 他ユーザの座標情報を保持
  // （これを自分のアイコンと同様に画面表示用のstyleに反映する）
  const [ otherUserWindowInfo, setOtherUserWindowInfo ] = useState<WindowInfo>({ top: 0, left: 0, width: 200 });

  // 他ユーザのウィンドウの位置・大きさの変更
  const otherUserWindowContainerStyle = useMemo<React.CSSProperties>(() => ({
    position: "absolute",
    top: otherUserWindowInfo.top,
    left: otherUserWindowInfo.left,
    width: otherUserWindowInfo.width
  }), [ otherUserWindowInfo ]);

  useEffect(() => {
    // console.log("相手のデータ受信設定");
    if (otherUserDataStream != null) {
      // callbackで受信座標を反映する
      otherUserDataStream.onData.add((args) => {
        setOtherUserWindowInfo(args as WindowInfo);
        // console.log("相手のデータを受信しました！");
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
    // console.log(otherPublifications);
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
      if (e.publication.contentType === "data" && e.publication.publisher.id !== me.id) {
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
        <div className="icon-container">
          <video id="local-video" ref={localVideo} muted playsInline style={myWindowContainerStyle}></video>
          <Webcam id="local-video" ref={webcamRef} muted playsInline style={myWindowContainerStyle} disabled={true}/>
        </div>
        <div className="icon-container">
        {
          me != null && otherUserPublications.map(p => (
            <RemoteMedia id="remote-video" key={p.id} me={me} publication={p} style={otherUserWindowContainerStyle}/>
          ))
        }  
        </div>
      </div>
    </div>
  )
}