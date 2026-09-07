import package::bindings::temperature;
import package::passes::climate::temperatureAt;

fn tile(x: i32, y: i32, i: u32) {
  temperature[i] = temperatureAt(x, y, i);
}
