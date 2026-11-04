export type PlatformSurface = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CourseHazard = {
  x: number;
  y: number;
  width: number;
};

export type CourseGem = {
  x: number;
  y: number;
};

export type PlatformerStage = {
  id: string;
  name: string;
  subtitle: string;
  length: number;
  startX: number;
  finishX: number;
  background: [string, string];
  ground: string;
  highlight: string;
  platforms: PlatformSurface[];
  hazards: CourseHazard[];
  checkpoints: number[];
  gems: CourseGem[];
};

export const PLATFORMER_STAGES: PlatformerStage[] = [
  {
    id: 'mantar-vadisi',
    name: 'Mantar Vadisi',
    subtitle: 'İlk sıçrayışını yap, vadinin öbür ucuna ulaş.',
    length: 1640,
    startX: 48,
    finishX: 1570,
    background: ['#8BD8DE', '#E5F4C8'],
    ground: '#3C9A70',
    highlight: '#B9EF8D',
    platforms: [
      { x: 0, y: 204, width: 292, height: 70 },
      { x: 348, y: 184, width: 238, height: 90 },
      { x: 642, y: 206, width: 190, height: 68 },
      { x: 888, y: 166, width: 230, height: 108 },
      { x: 1170, y: 190, width: 205, height: 84 },
      { x: 1425, y: 204, width: 215, height: 70 },
    ],
    hazards: [
      { x: 216, y: 204, width: 47 },
      { x: 446, y: 184, width: 49 },
      { x: 766, y: 206, width: 40 },
      { x: 1016, y: 166, width: 48 },
      { x: 1293, y: 190, width: 43 },
    ],
    checkpoints: [530, 1050],
    gems: [{ x: 312, y: 151 }, { x: 758, y: 155 }, { x: 1394, y: 151 }],
  },
  {
    id: 'kristal-tunelleri',
    name: 'Kristal Tünelleri',
    subtitle: 'Mağara kristalleri parlıyor; inişlere dikkat et.',
    length: 1640,
    startX: 48,
    finishX: 1570,
    background: ['#334D75', '#9A83B8'],
    ground: '#426A91',
    highlight: '#86E5E6',
    platforms: [
      { x: 0, y: 200, width: 250, height: 74 },
      { x: 308, y: 160, width: 206, height: 114 },
      { x: 568, y: 205, width: 232, height: 69 },
      { x: 855, y: 178, width: 205, height: 96 },
      { x: 1110, y: 148, width: 205, height: 126 },
      { x: 1367, y: 201, width: 273, height: 73 },
    ],
    hazards: [
      { x: 168, y: 200, width: 48 },
      { x: 378, y: 160, width: 43 },
      { x: 703, y: 205, width: 51 },
      { x: 950, y: 178, width: 45 },
      { x: 1207, y: 148, width: 42 },
      { x: 1473, y: 201, width: 45 },
    ],
    checkpoints: [520, 1082],
    gems: [{ x: 270, y: 150 }, { x: 824, y: 145 }, { x: 1330, y: 126 }],
  },
  {
    id: 'kor-gecidi',
    name: 'Kor Geçidi',
    subtitle: 'Son etap: lav yarıklarını aş ve tacı kap.',
    length: 1640,
    startX: 48,
    finishX: 1570,
    background: ['#6D4165', '#F0A05F'],
    ground: '#955054',
    highlight: '#FFCC70',
    platforms: [
      { x: 0, y: 205, width: 236, height: 69 },
      { x: 300, y: 172, width: 192, height: 102 },
      { x: 552, y: 203, width: 205, height: 71 },
      { x: 817, y: 151, width: 224, height: 123 },
      { x: 1100, y: 183, width: 194, height: 91 },
      { x: 1354, y: 197, width: 286, height: 77 },
    ],
    hazards: [
      { x: 140, y: 205, width: 45 },
      { x: 379, y: 172, width: 49 },
      { x: 654, y: 203, width: 47 },
      { x: 923, y: 151, width: 55 },
      { x: 1170, y: 183, width: 46 },
      { x: 1452, y: 197, width: 50 },
    ],
    checkpoints: [515, 1055],
    gems: [{ x: 254, y: 153 }, { x: 781, y: 151 }, { x: 1324, y: 158 }],
  },
];

export const PLATFORMER_BALL_RADIUS = 18;
export const PLATFORMER_GRAVITY = 0.48;
export const PLATFORMER_ACCELERATION = 0.42;
export const PLATFORMER_MAX_SPEED = 5.4;
export const PLATFORMER_JUMP_SPEED = 10.6;
