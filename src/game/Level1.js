import Ghost from "./Ghost.js";
import SmallPac from "./SmallPac.js";
import { socket } from "../../components/App";
import loadImagesAndAudio from "./imagesToLoad";
import { setUpMapLayer } from "./setUpLayers";
import {
  listenForPlayerMovement,
  listenForGhostMovement,
  listenForDotActivity,
  listenForGhostDeath,
  listenForSomeonesDeath
} from "./socketListeners";
import { sendMovementInfo, sendGhostMovement } from "./socketEmiters";
import checkWin from "./checkWin";
import { toggleSound } from "./socketListeners";
import { displayInstructions } from "./instructions";

export default class Level1 extends Phaser.Scene {
  constructor() {
    super({ key: "Level1" });
    this["1"] = {
      startPositions: { x: 12.57, y: 5.57 },
      color: "y"
    };
    this["2"] = {
      startPositions: { x: 18.57, y: 5.57 },
      color: "r"
    };
    this["3"] = {
      startPositions: { x: 12.57, y: 9.57 },
      color: "b"
    };
    this["4"] = {
      startPositions: { x: 18.57, y: 9.57 },
      color: "p"
    };

    this.socket = socket;
    this.otherPlayersArray = [];

    this.playersAlive = {};

    this.winner = "";
  }
  preload() {
    //loads image for tileset
    loadImagesAndAudio(this);

    //loads image of map
    this.load.tilemapTiledJSON(
      "map",
      "/public/assets/newMapWithFoodDots6.json"
    );

  }

  create() {
    this.sound.play('fruit');

    const scene = this;

    this.otherPlayers = this.physics.add.group();
    this.ghosts = this.physics.add.group();

    this.socket.on("disconnect", playerId => {
      scene.otherPlayers.getChildren().forEach(otherPlayer => {
        if (playerId === otherPlayer.playerId) {
          // otherPlayer.destroy();
        }
      });
    });

    //makes the tilemap and defines the height and width of the tiles
    this.map = this.make.tilemap({
      key: "map",
      tileWidth: 60,
      tileHeight: 60
    });
    // let map = this.add.tilemap("map");
    //adds the tileset to the map

    setUpMapLayer(this);

    window.addEventListener("resize", resizeCanvas);

    resizeCanvas();

    this.og = new Ghost({
      scene: scene,
      key: "og1",
      // x: scene.map.tileToWorldX(15),
      // y: scene.map.tileToWorldY(8),
      x: scene.map.tileToWorldX(15.571),
      y: scene.map.tileToWorldY(7.56),
      game: this.game
    });

    listenForGhostMovement(this);

    listenForDotActivity(this);

    listenForPlayerMovement(this);

    listenForGhostDeath(this);

    listenForSomeonesDeath(this);

    this.ghosts.add(this.og);
    this.og.setBounce(0, 1);

    this.physics.add.collider(this.ghosts, this.collisionLayer);

    //processes DOM input events if true
    this.input.enabled = true;
    this.cursors = this.input.keyboard.createCursorKeys();

    //ADD INSTRUCTIONS
    displayInstructions(this);
  }
  update() {
    //CHECK WIN
    if (!this.winner) {
      if (!checkWin(this)) {
        // if(true){
        if (!this.og.dead) {
          this.og.setOffset(7, 7);
        }
        //IF GHOST IS DEAD TELL EVERYONE AND DISABLE GHOST;
        if (this.og.dead && this.og.body.enable) {
          this.socket.emit("ghostDeath", socket.roomId);
          this.og.disableBody(true, true);
          if (toggleSound) {
            let eatGhostSound = this.sound.add("eat_ghost");
            eatGhostSound.play();
          }
        }
        //IF GHOST IS VULNERABLE, TURN BLUE
        //IF YOU ARE SMALL AND OTHER PLAYERS ARE ALSO SMALL, MAKE GHOST NOT VULERABLE
        if (this.og.vulnerable) {
          this.og.turnBlue();
          const playersAreSmall = this.otherPlayersArray.every(
            player => !player.big
          );
          if (playersAreSmall && !this.pac.big) {
            this.og.vulnerable = false;
          }
        }
        //IF PAC EXISTS
        if (this.pac) {
          //IF YOU ARE ALIVE
          if (!this.pac.dead) {
            //UPDATE TRAJECTORY
            this.pac.trajectory();
            //SEND EVERYONE YOUR MOVES
            sendMovementInfo(this);
            this.pac.big
              ? this.pac.setOffset(21, 21)
              : this.pac.setOffset(7, 7);
          }

          //IF YOU ARE PLAYER 1 AND GHOST IS ALIVE
          if (this.pac.playerNumber === 1 && !this.og.dead) {
            //ELSE LET EVERYONE KNOW WHERE GHOST SHOULD BE
            this.og.trajectory();
            sendGhostMovement(this);
          }
          //IF YOU ARE DEAD TELL EVERYONE AND DELETE YOURSELF
          if (this.pac.dead && this.playersAlive[this.pac.playerNumber]) {
            this.socket.emit("selfDeath", socket.roomId, this.pac.playerNumber);
            this.pac.death();
            let deathSound = this.sound.add("death");
            deathSound.play();
            this.pac.setVelocityX(0);
            this.pac.setVelocityY(0);
            this.time.delayedCall(
              500,
              () => {
                this.pac.disableBody(true, true);
                delete this.playersAlive[this.pac.playerNumber];
              },
              [],
              this
            );
            delete this.playersAlive[this.pac.playerNumber];
            if (toggleSound) {
              let deathSound = this.sound.add("death");
              deathSound.play();
            }
          }
          //FOR EACH PLAYER
          this.otherPlayersArray.forEach(player => {
            //IF YOU HEAR SOMEONE IS DEAD, DISABLE THEM AND DELETE THEM
            if (player.dead && this.playersAlive[player.playerNumber]) {
              player.death();
              player.createAnimations();
              player.setVelocityX(0);
              player.setVelocityY(0);
              this.time.delayedCall(
                500,
                player => {
                  player.disableBody(true, true);
                  delete this.playersAlive[player.playerNumber];
                },
                [player],
                this
              );
            } else {
              //IF SOMEONE IS BIG AND GHOST IS NOT VULNERABLE, MAKE GHOST VULNERABLE
              if (player.big && !this.og.vulnerable) {
                this.og.vulnerable = true;
              }

              if (!player.dead && this.scene.gameOver === false) {
                player.big ? player.setOffset(21, 21) : player.setOffset(7, 7);
                player.wrap();
                player.updateTilePosition();
              }
            }
          });
        }
      }
    }
  }
}

function resizeCanvas() {
  const canvas = document.querySelector("canvas");
  canvas.style.width = `${(window.innerWidth / 1860) * 1860}px`;
  canvas.style.height = `${(window.innerWidth / 1860) * 900}px`;
}
