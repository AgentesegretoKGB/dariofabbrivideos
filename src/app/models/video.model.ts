export interface Video {
  id: number;
  url: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  tags: {
    [group: string]: string[];
  };
  // true = aggiunto dalla catalogazione automatica, non ancora controllato a mano
  pending?: boolean;
}
