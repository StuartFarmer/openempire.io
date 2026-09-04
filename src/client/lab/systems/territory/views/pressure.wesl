// Battle heat: unpacked incoming attack pressure.
import package::layers;
import package::lib::combat::pressureOf;

fn value(x: i32, y: i32, i: u32) -> f32 {
  return pressureOf(layers::attack::val(i)) * 2.0;
}
