// Where the wars are: incoming military pressure per tile, so active fronts
// and the direction of pushes light up.
import package::layers;
import package::lib::combat::pressureOf;

fn value(x: i32, y: i32, i: u32) -> f32 {
  return pressureOf(layers::incursion::val(i)) * 3.0;
}
